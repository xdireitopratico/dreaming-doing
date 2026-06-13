
-- P31: Knowledge Graph tables (Postgres-native graph pattern)
-- Since Supabase doesn't support Apache AGE, we use a property graph model with nodes + edges tables

-- Graph nodes
CREATE TABLE IF NOT EXISTS public.kg_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    graph_id TEXT NOT NULL DEFAULT 'default',
    label TEXT NOT NULL,
    node_type TEXT NOT NULL,
    properties JSONB DEFAULT '{}',
    embedding extensions.vector(768),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Graph edges (relationships)
CREATE TABLE IF NOT EXISTS public.kg_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    graph_id TEXT NOT NULL DEFAULT 'default',
    source_node_id UUID NOT NULL REFERENCES public.kg_nodes(id) ON DELETE CASCADE,
    target_node_id UUID NOT NULL REFERENCES public.kg_nodes(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    properties JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for graph traversal
CREATE INDEX IF NOT EXISTS idx_kg_nodes_tenant_graph ON public.kg_nodes(tenant_id, graph_id);
CREATE INDEX IF NOT EXISTS idx_kg_nodes_type ON public.kg_nodes(tenant_id, node_type);
CREATE INDEX IF NOT EXISTS idx_kg_edges_source ON public.kg_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_target ON public.kg_edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_tenant_graph ON public.kg_edges(tenant_id, graph_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_relationship ON public.kg_edges(tenant_id, relationship);

-- RLS
ALTER TABLE public.kg_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kg_edges ENABLE ROW LEVEL SECURITY;

-- Policies: tenant isolation via agent_flows ownership
CREATE POLICY "Tenant sees own kg_nodes" ON public.kg_nodes FOR SELECT TO authenticated
USING (tenant_id IN (SELECT id FROM public.agent_flows WHERE user_id = auth.uid()));

CREATE POLICY "Tenant inserts own kg_nodes" ON public.kg_nodes FOR INSERT TO authenticated
WITH CHECK (tenant_id IN (SELECT id FROM public.agent_flows WHERE user_id = auth.uid()));

CREATE POLICY "Tenant updates own kg_nodes" ON public.kg_nodes FOR UPDATE TO authenticated
USING (tenant_id IN (SELECT id FROM public.agent_flows WHERE user_id = auth.uid()));

CREATE POLICY "Tenant deletes own kg_nodes" ON public.kg_nodes FOR DELETE TO authenticated
USING (tenant_id IN (SELECT id FROM public.agent_flows WHERE user_id = auth.uid()));

CREATE POLICY "Tenant sees own kg_edges" ON public.kg_edges FOR SELECT TO authenticated
USING (tenant_id IN (SELECT id FROM public.agent_flows WHERE user_id = auth.uid()));

CREATE POLICY "Tenant inserts own kg_edges" ON public.kg_edges FOR INSERT TO authenticated
WITH CHECK (tenant_id IN (SELECT id FROM public.agent_flows WHERE user_id = auth.uid()));

CREATE POLICY "Tenant deletes own kg_edges" ON public.kg_edges FOR DELETE TO authenticated
USING (tenant_id IN (SELECT id FROM public.agent_flows WHERE user_id = auth.uid()));

-- Service role policies for edge functions
CREATE POLICY "Service role full access kg_nodes" ON public.kg_nodes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access kg_edges" ON public.kg_edges FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RPC: Get neighbors of a node (1-hop traversal)
CREATE OR REPLACE FUNCTION public.kg_get_neighbors(
    p_node_id UUID,
    p_tenant_id UUID,
    p_direction TEXT DEFAULT 'both',
    p_relationship TEXT DEFAULT NULL,
    p_max_depth INT DEFAULT 1
)
RETURNS TABLE(
    node_id UUID,
    node_label TEXT,
    node_type TEXT,
    node_properties JSONB,
    edge_id UUID,
    edge_relationship TEXT,
    edge_weight REAL,
    edge_properties JSONB,
    direction TEXT,
    depth INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE traversal AS (
        -- Base: direct neighbors
        SELECT 
            CASE WHEN e.source_node_id = p_node_id THEN e.target_node_id ELSE e.source_node_id END AS nid,
            e.id AS eid,
            e.relationship AS erel,
            e.weight AS ew,
            e.properties AS ep,
            CASE WHEN e.source_node_id = p_node_id THEN 'outgoing' ELSE 'incoming' END AS dir,
            1 AS d
        FROM public.kg_edges e
        WHERE e.tenant_id = p_tenant_id
          AND (
            (p_direction IN ('both', 'outgoing') AND e.source_node_id = p_node_id)
            OR (p_direction IN ('both', 'incoming') AND e.target_node_id = p_node_id)
          )
          AND (p_relationship IS NULL OR e.relationship = p_relationship)
        
        UNION ALL
        
        -- Recursive: deeper levels
        SELECT
            CASE WHEN e.source_node_id = t.nid THEN e.target_node_id ELSE e.source_node_id END,
            e.id,
            e.relationship,
            e.weight,
            e.properties,
            CASE WHEN e.source_node_id = t.nid THEN 'outgoing' ELSE 'incoming' END,
            t.d + 1
        FROM traversal t
        JOIN public.kg_edges e ON (
            (e.source_node_id = t.nid OR e.target_node_id = t.nid)
            AND e.tenant_id = p_tenant_id
        )
        WHERE t.d < p_max_depth
          AND (p_relationship IS NULL OR e.relationship = p_relationship)
          AND CASE WHEN e.source_node_id = t.nid THEN e.target_node_id ELSE e.source_node_id END != p_node_id
    )
    SELECT DISTINCT ON (t.nid)
        t.nid AS node_id,
        n.label AS node_label,
        n.node_type,
        n.properties AS node_properties,
        t.eid AS edge_id,
        t.erel AS edge_relationship,
        t.ew AS edge_weight,
        t.ep AS edge_properties,
        t.dir AS direction,
        t.d AS depth
    FROM traversal t
    JOIN public.kg_nodes n ON n.id = t.nid
    ORDER BY t.nid, t.d ASC;
END;
$$;

-- RPC: Find shortest path between two nodes (BFS)
CREATE OR REPLACE FUNCTION public.kg_shortest_path(
    p_source_id UUID,
    p_target_id UUID,
    p_tenant_id UUID,
    p_max_depth INT DEFAULT 6
)
RETURNS TABLE(
    path_node_id UUID,
    path_node_label TEXT,
    path_edge_relationship TEXT,
    path_step INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE bfs AS (
        SELECT 
            p_source_id AS current_node,
            ARRAY[p_source_id] AS visited,
            ARRAY[NULL::TEXT] AS edge_rels,
            0 AS step
        
        UNION ALL
        
        SELECT
            CASE WHEN e.source_node_id = b.current_node THEN e.target_node_id ELSE e.source_node_id END,
            b.visited || CASE WHEN e.source_node_id = b.current_node THEN e.target_node_id ELSE e.source_node_id END,
            b.edge_rels || e.relationship,
            b.step + 1
        FROM bfs b
        JOIN public.kg_edges e ON (
            (e.source_node_id = b.current_node OR e.target_node_id = b.current_node)
            AND e.tenant_id = p_tenant_id
        )
        WHERE b.step < p_max_depth
          AND NOT (CASE WHEN e.source_node_id = b.current_node THEN e.target_node_id ELSE e.source_node_id END = ANY(b.visited))
          AND NOT (p_target_id = ANY(b.visited))
    )
    SELECT 
        unnest(b.visited) AS path_node_id,
        n.label AS path_node_label,
        unnest(b.edge_rels) AS path_edge_relationship,
        generate_series(0, array_length(b.visited, 1) - 1) AS path_step
    FROM bfs b
    JOIN LATERAL unnest(b.visited) WITH ORDINALITY AS u(nid, ord) ON true
    JOIN public.kg_nodes n ON n.id = u.nid
    WHERE p_target_id = ANY(b.visited)
    ORDER BY b.step ASC, u.ord ASC
    LIMIT (p_max_depth + 1);
END;
$$;

-- Register P31 tools in tool_registry
INSERT INTO public.tool_registry (name, display_name, description, category, executor_type, is_builtin, is_active, input_schema, output_schema, required_secrets, requires_idempotency, sandbox_level)
VALUES
  ('kg_node_create', 'Criar Nó no Grafo', 'Cria um nó no grafo de conhecimento do tenant', 'data', 'builtin', true, true,
   '{"label": {"type": "string", "required": true}, "node_type": {"type": "string", "required": true}, "properties": {"type": "object"}, "graph_id": {"type": "string", "default": "default"}}',
   '{"node_id": "string", "label": "string", "node_type": "string"}',
   null, true, 'none'),
  ('kg_edge_create', 'Criar Aresta no Grafo', 'Cria uma relação entre dois nós no grafo de conhecimento', 'data', 'builtin', true, true,
   '{"source_node_id": {"type": "string", "required": true}, "target_node_id": {"type": "string", "required": true}, "relationship": {"type": "string", "required": true}, "weight": {"type": "number", "default": 1.0}, "properties": {"type": "object"}, "graph_id": {"type": "string", "default": "default"}}',
   '{"edge_id": "string", "relationship": "string"}',
   null, true, 'none'),
  ('kg_query', 'Consultar Grafo', 'Consulta o grafo de conhecimento — vizinhos, caminho mais curto, subgrafo por tipo', 'data', 'builtin', true, true,
   '{"query_type": {"type": "string", "enum": ["neighbors", "shortest_path", "subgraph", "search"], "required": true}, "node_id": {"type": "string"}, "target_node_id": {"type": "string"}, "node_type": {"type": "string"}, "relationship": {"type": "string"}, "direction": {"type": "string", "enum": ["both", "incoming", "outgoing"], "default": "both"}, "max_depth": {"type": "number", "default": 2}, "graph_id": {"type": "string", "default": "default"}, "search_text": {"type": "string"}}',
   '{"nodes": "array", "edges": "array", "path": "array"}',
   null, false, 'none'),
  ('kg_visualize', 'Exportar Grafo para Visualização', 'Exporta subgrafo em formato compatível com visualizadores (vis.js, D3, Cytoscape)', 'data', 'builtin', true, true,
   '{"graph_id": {"type": "string", "default": "default"}, "format": {"type": "string", "enum": ["visjs", "d3", "cytoscape"], "default": "visjs"}, "center_node_id": {"type": "string"}, "max_nodes": {"type": "number", "default": 50}}',
   '{"nodes": "array", "edges": "array", "format": "string", "stats": "object"}',
   null, false, 'none')
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema,
  is_active = true,
  updated_at = now();
