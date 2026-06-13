-- Flow canvas node ids are strings (e.g. trigger_1), not UUIDs.
-- agent_execution_steps.node_id was UUID → inserts failed silently.

ALTER TABLE public.agent_execution_steps
  ALTER COLUMN node_id TYPE TEXT USING node_id::text;

COMMENT ON COLUMN public.agent_execution_steps.node_id IS
  'Flow node id from flow_definition.nodes[].id (string slug, not kg_nodes UUID)';