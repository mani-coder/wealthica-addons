#!/usr/bin/env bash
# upload-transfers.sh - Create transfer transactions in Wealthica from a CSV file.
#
# CSV format (no spaces):
# Symbol,Institution,Investment,Security Id,Price,Shares,Amount
#   TTD,5bff...,5180...:rrsp:usd,59f9...,64.217,38.000,2440.25
#
# Usage:
#   WEALTHICA_TOKEN=<token> ./upload-transfers.sh ~/Downloads/open-book.csv [YYYY-MM-DD]
#
# Requirements:
#   curl, jq
# -------------------------------------------------------------

set -euo pipefail

# Positional args
CSV_FILE=${1:-}
DIRECTION=${2:-OUT}
TX_DATE=${3:-$(date +%F)}
MODE=${4:-dry}

# Determine execution mode
EXECUTE=false
if [[ "$MODE" == "run" || "$MODE" == "exec" ]]; then
  EXECUTE=true
fi

# Inform mode
echo "Mode: $([[ $EXECUTE == true ]] && echo 'RUN' || echo 'DRY-RUN')"

# Validate direction
if [[ "$DIRECTION" != "IN" && "$DIRECTION" != "OUT" ]]; then
  echo "Error: direction must be either 'IN' or 'OUT'." >&2
  exit 1
fi

# Determine sign multiplier (-1 for OUT, +1 for IN)
SIGN_MULT="1"
if [[ "$DIRECTION" == "OUT" ]]; then
  SIGN_MULT="-1"
fi

API_URL="https://app.wealthica.com/api/transactions"

if [[ -z "$CSV_FILE" ]]; then
  echo "Error: CSV file path required." >&2
  exit 1
fi

if [[ ! -f "$CSV_FILE" ]]; then
  echo "Error: CSV file '$CSV_FILE' does not exist." >&2
  exit 1
fi

if [[ -z "${WEALTHICA_TOKEN:-}" ]]; then
  echo "Error: WEALTHICA_TOKEN environment variable is not set." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: 'jq' is required but not installed." >&2
  exit 1
fi

echo "Uploading transfers from '$CSV_FILE' (date: $TX_DATE) ..."

# Skip header line and iterate over rows (POSIX compatible)
tail -n +2 "$CSV_FILE" | while IFS=',' read -r SYMBOL INSTITUTION INVESTMENT SECURITY_ID CURRENCY PRICE SHARES AMOUNT; do
  # Trim whitespace (in case)
  SYMBOL="${SYMBOL//\r/}"

  QTY=$(awk -v s="$SHARES" -v m="$SIGN_MULT" 'BEGIN{printf("%.0f", s*m)}')
  AMT=$(awk -v a="$AMOUNT" -v m="$SIGN_MULT" 'BEGIN{printf("%.2f", a*m)}')

  JSON_BODY=$(jq -n \
    --arg type "transfer" \
    --arg security "$SECURITY_ID" \
    --arg symbol "$SYMBOL" \
    --arg institution "$INSTITUTION" \
    --arg investment "$INVESTMENT" \
    --arg date "$TX_DATE" \
    --arg qty "$QTY" \
    --arg amt "$AMT" \
    --arg direction "$DIRECTION" \
    '{
        type: $type,
        security: $security,
        symbol: $symbol,
        category: null,
        amounts: [],
        asset: null,
        institution: $institution,
        investment: $investment,
        investments: [],
        date: $date,
        settlement_date: $date,
        note: "Accounts Transfer",
        quantity: ($qty | tonumber),
        description: ("Transfer " + $symbol + " (" + $direction + ")"),
        currency_amount: ($amt | tonumber)
      }')

  if [[ "$EXECUTE" == true ]]; then
    echo "Posting transfer for $SYMBOL ..."
    http_status=$(curl -s -w "%{http_code}" -o /dev/null \
      -H "Authorization: Bearer $WEALTHICA_TOKEN" \
      -H "Content-Type: application/json" \
      -X POST "$API_URL" \
      -d "$JSON_BODY")

    if [[ "$http_status" == "201" || "$http_status" == "200" ]]; then
      echo "  Success ($http_status)"
    else
      echo "  Failed ($http_status) - payload: $JSON_BODY" >&2
    fi
  else
    echo -e "\nDRY RUN -> Would POST to: $API_URL\nPayload: $JSON_BODY\n"
  fi

done

echo "Done." 