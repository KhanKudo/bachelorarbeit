#!/usr/bin/env bash
set -euo pipefail

TEMPLATE_FILE="template.sh"

if [[ ! -f "$TEMPLATE_FILE" ]]; then
    echo "Error: Template file '$TEMPLATE_FILE' not found." >&2
    exit 1
fi

for id in node peer; do
(
# cd "$id"
INPUT_YML="$id.sh.yml"
OUTPUT_SH="$id.sh"
LOGFILE="$id.log"

if [[ ! -f "$INPUT_YML" ]]; then
    echo "Error: Input file '$INPUT_YML' not found." >&2
    exit 1
fi

BUILD_DATE=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

TMP_YML="$(mktemp)"
trap 'rm -f "$TMP_YML"' EXIT INT TERM

cp "$INPUT_YML" "$TMP_YML"

while yq -e '.steps[] | select(has("ref"))' "$TMP_YML" >/dev/null 2>&1; do
  RAW_REF=$(yq -r 'first(.steps[] | select(has("ref")) | .ref)' "$TMP_YML")

  REF_FILE="$RAW_REF"
  if [[ "$REF_FILE" != *.sh.yml ]]; then
    REF_FILE="${REF_FILE}.sh.yml"
  fi

  if [ ! -f "$REF_FILE" ]; then
    echo "Error: Referenced file $REF_FILE not found." >&2
    exit 1
  fi

  TARGET_JSON=$(yq '.' "$REF_FILE")

  yq -y --arg raw_ref "$RAW_REF" --arg ref_file "$REF_FILE" --argjson target "$TARGET_JSON" '
    .steps |= [
    .[] | if (.ref == $raw_ref or .ref == $ref_file) then $target.steps[] else . end
    ]
  ' "$TMP_YML" > "$TMP_YML.tmp" && mv "$TMP_YML.tmp" "$TMP_YML"
done

step_count=$(yq -r '.steps | length' "$TMP_YML")
TOTAL="$step_count"

ALL_STEPS_JSON=$(yq -c '.steps' "$TMP_YML")

render_step_block() {
    local block_template="$1"

    for (( i=0; i<step_count; i++ )); do
        local step_json=$(jq -c ".[$i]" <<< "$ALL_STEPS_JSON")

        name=$(jq -r '.name // ""' <<< "$step_json") \
        target_user=$(jq -r '.user // ""' <<< "$step_json") \
        script_content=$(jq -r '.script // ""' <<< "$step_json") \
        check_content=$(jq -r '.check // ""' <<< "$step_json") \
        check_enabled=$(jq -r 'has("check")' <<< "$step_json") \
        confirm_prompt=$(jq -r '.confirm // ""' <<< "$step_json") \
        skip_prompt=$(jq -r '.skip // ""' <<< "$step_json") \
        for_var=$(jq -r '.for // ""' <<< "$step_json") \
        env_vars=$(jq -r '(.env // [])[]' <<< "$step_json") \
        func_id="step_${i}" \
        idx_display=$((i + 1)) \
        awk '
          BEGIN {
            vars["%id%"]      = ENVIRON["func_id"]
            vars["%for%"]     = ENVIRON["for_var"]
            vars["%name%"]    = ENVIRON["name"]
            vars["%envs%"]    = ENVIRON["env_vars"]
            vars["%user%"]    = ENVIRON["target_user"]
            vars["%skip%"]    = ENVIRON["skip_prompt"]
            vars["%index%"]   = ENVIRON["idx_display"]
            vars["%check%"]   = ENVIRON["check_content"]
            vars["%script%"]  = ENVIRON["script_content"]
            vars["%confirm%"] = ENVIRON["confirm_prompt"]
            vars["%check_enabled%"]  = ENVIRON["check_enabled"]
          }
          {
            line = $0
            for (token in vars) {
                if (idx = index(line, token)) {
                    head = substr(line, 1, idx - 1)
                    tail = substr(line, idx + length(token))
                    line = head vars[token] tail
                }
            }
            print line
          }
          ' <<< "$block_template"
    done
}

# Process template line-by-line
{
    in_step=0
    step_buffer=""

    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line//%INPUT_YML%/$INPUT_YML}"
        line="${line//%BUILD_DATE%/$BUILD_DATE}"
        line="${line//%LOGFILE%/$LOGFILE}"
        line="${line//%TOTAL%/$TOTAL}"
        line="${line//%VMID%/$id}"

        if [[ "$line" == *"#step-start#"* ]]; then
            in_step=1
            step_buffer=""
            continue
        fi

        if [[ "$line" == *"#step-end#"* ]]; then
            in_step=0
            render_step_block "$step_buffer"
            step_buffer=""
            continue
        fi

        if [[ "$in_step" -eq 1 ]]; then
            if [[ -z "$step_buffer" ]]; then
                step_buffer="$line"
            else
                step_buffer+=$'\n'"$line"
            fi
        else
            echo "$line"
        fi
    done < "$TEMPLATE_FILE"
} > "$OUTPUT_SH"

chmod +x "$OUTPUT_SH"
echo "Successfully generated '$OUTPUT_SH' ($BUILD_DATE)."
) &
done

wait