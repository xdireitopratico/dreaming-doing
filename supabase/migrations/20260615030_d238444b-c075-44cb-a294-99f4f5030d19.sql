-- Fix FK constraints missing ON DELETE CASCADE

-- 1. prometheus_build_sessions.target_flow_id
ALTER TABLE prometheus_build_sessions
  DROP CONSTRAINT IF EXISTS prometheus_build_sessions_target_flow_id_fkey;
ALTER TABLE prometheus_build_sessions
  ADD CONSTRAINT prometheus_build_sessions_target_flow_id_fkey
  FOREIGN KEY (target_flow_id) REFERENCES agent_flows(id) ON DELETE SET NULL;

-- 2. prometheus_build_sessions.output_flow_id
ALTER TABLE prometheus_build_sessions
  DROP CONSTRAINT IF EXISTS prometheus_build_sessions_output_flow_id_fkey;
ALTER TABLE prometheus_build_sessions
  ADD CONSTRAINT prometheus_build_sessions_output_flow_id_fkey
  FOREIGN KEY (output_flow_id) REFERENCES agent_flows(id) ON DELETE SET NULL;

-- 3. agent_executions.flow_id
ALTER TABLE agent_executions
  DROP CONSTRAINT IF EXISTS agent_executions_flow_id_fkey;
ALTER TABLE agent_executions
  ADD CONSTRAINT agent_executions_flow_id_fkey
  FOREIGN KEY (flow_id) REFERENCES agent_flows(id) ON DELETE CASCADE;

-- 4. agent_flows self-reference parent_version_id
ALTER TABLE agent_flows
  DROP CONSTRAINT IF EXISTS agent_flows_parent_version_id_fkey;
ALTER TABLE agent_flows
  ADD CONSTRAINT agent_flows_parent_version_id_fkey
  FOREIGN KEY (parent_version_id) REFERENCES agent_flows(id) ON DELETE SET NULL;