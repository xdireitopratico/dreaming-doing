#!/usr/bin/env bash
# Porta migrations AetherForge/Prometheus do vibrant → dreaming-doing (ordem cronológica).
set -euo pipefail

SRC="/home/rdarienzo/Projetos/vibrant-visionary-craft1/supabase/migrations"
DST="/home/rdarienzo/Projetos/dreaming-doing/supabase/migrations"
PREFIX="20260615"

FILES=(
  "20260314111543_aec0a784-bc08-4920-aff8-a7184243d0ea.sql"
  "20260314111622_29c99268-d3b6-4d96-8e2f-bc14809d3f9e.sql"
  "20260314111903_9fa960d3-4397-4215-aa6e-961c91b5bcc9.sql"
  "20260314173338_42212ec8-c6ca-4c85-8616-40215e0d94e8.sql"
  "20260314124805_cffae748-a87a-4662-ab62-c5c35414eb83.sql"
  "20260314130132_04d9382a-5ae0-4260-b18d-d275656a70bb.sql"
  "20260314130653_eb69eb6a-d773-4bda-a470-0dcace372804.sql"
  "20260314131742_cde42d60-1f19-49ff-82d1-43b8414fc28d.sql"
  "20260314132033_5aece25a-5e35-4a83-b2bf-2fe5dcbb04c7.sql"
  "20260314132842_bf4c615c-edb9-4ad5-a5ee-a4f50339b9ad.sql"
  "20260314135817_3c9cff46-a47e-48d8-987d-efe6117212e5.sql"
  "20260314141246_879c53b7-ec15-4db4-a1d5-7ec48b9f6d21.sql"
  "20260314183627_49fbe745-b11f-44ba-b380-3956722cf3bd.sql"
  "20260314183756_379b27a7-dc37-492d-b264-b74b13fdbe3b.sql"
  "20260314143859_ae11bda6-f087-4baf-9be6-0e9652dee37f.sql"
  "20260314143941_d0292f59-f63a-498e-a839-bac7738d2225.sql"
  "20260314144025_17cbafc0-a49c-405d-9e89-eb708e64d298.sql"
  "20260314201117_25289f9d-8ab7-49b4-a1b5-2ee08ccdc480.sql"
  "20260314222931_35b5f05e-e333-40ef-9e7b-1e6b61c5fc93.sql"
  "20260315020356_03054649-53ea-40de-a94a-1ba33c77b47d.sql"
  "20260315021511_5326f872-d977-401f-938f-b457f1b63204.sql"
  "20260315040352_b76fe709-5a71-47b9-839f-04ee4cb03299.sql"
  "20260315050746_7dc9c741-485b-4d27-b4b9-50fd7f415fbe.sql"
  "20260315063637_53470092-933c-411d-b58b-93e75f9a8934.sql"
  "20260315120001_fix_rls_execution_insert.sql"
  "20260315212717_7857f164-1f2d-47d8-ac91-0e3e16e80bd3.sql"
  "20260315212744_579d2e02-9d7b-47a8-8597-ee66c530afe4.sql"
  "20260316044534_66b0c614-6b03-4739-9267-5a0c1541a1ce.sql"
  "20260318000000_prometheus_react_v2.sql"
  "20260318100000_prometheus_atomic_iteration.sql"
  "20260318184752_13c5a244-0067-4d8d-b185-83d7cc6148e9.sql"
  "20260318190234_d238444b-c075-44cb-a294-99f4f5030d19.sql"
  "20260405184033_9925eac6-f430-4183-abd3-bdd7c437891d.sql"
)

# T05 tool_registry batch (consolidado em 20260616000005_tool_registry_batch.sql)
# P24-P33 + P35 INSERTs; exclui calendar (20260315043943) e jurídico (20260315045924)
TOOL_REGISTRY_FILES=(
  "20260315060117_a5c4c3ca-b2b9-41cb-bd22-3f9ca94d8cd5.sql"
  "20260315061027_e5edd1b1-9dcd-445c-91de-ea72a73a8f6c.sql"
  "20260315062032_13b365a7-013d-456a-9486-c4607606b353.sql"
  "20260315062417_8c5da79d-75e0-4f50-a458-7a497fc2dd8e.sql"
  "20260315062738_a9b2cba6-53f8-4f3e-a2dc-827ba266bead.sql"
  "20260315063043_8971d824-acea-491e-bea7-ac619cf1c256.sql"
  "20260315063322_538d1847-e0ff-47d8-9b26-8fd12ea4ab90.sql"
  "20260315063637_53470092-933c-411d-b58b-93e75f9a8934.sql"
  "20260315064155_e0dc6b10-a648-4733-b3b0-9ecd12605f56.sql"
  "20260315064518_2e0667e5-81a0-461d-8678-1ee2153c6de6.sql"
  "20260315130130_09d72d7e-2686-4220-b835-608feeafae25.sql"
  "20260315134424_f777693f-7525-432f-b3a3-519cca710ff2.sql"
)

i=1
for f in "${FILES[@]}"; do
  src="$SRC/$f"
  if [[ ! -f "$src" ]]; then
    echo "MISSING: $src" >&2
    exit 1
  fi
  seq=$(printf "%03d" "$i")
  base="${f#*_}"
  out="$DST/${PREFIX}${seq}_${base}"
  cp "$src" "$out"
  echo "→ $out"
  i=$((i + 1))
done

echo "✓ ${#FILES[@]} migrations portadas."