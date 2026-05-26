#!/usr/bin/env bash

set -euo pipefail

readonly DEFAULT_ITEM_ID="gbldofcpkknbggpkmbdaefngejllnief"
readonly DEFAULT_TIMEOUT_SECONDS=180
readonly DEFAULT_POLL_INTERVAL_SECONDS=10

ZIP_PATH=""
ITEM_ID="$DEFAULT_ITEM_ID"
TIMEOUT_SECONDS="${CHROME_WEB_STORE_TIMEOUT_SECONDS:-$DEFAULT_TIMEOUT_SECONDS}"
POLL_INTERVAL_SECONDS="${CHROME_WEB_STORE_POLL_INTERVAL_SECONDS:-$DEFAULT_POLL_INTERVAL_SECONDS}"
VERBOSE=0

usage() {
  cat <<'EOF'
Usage:
  bash scripts/publish-chrome-extension.sh --zip-path <path-to-zip> [--verbose]

Required environment variables:
  CHROME_WEB_STORE_PUBLISHER_ID
  CHROME_WEB_STORE_CLIENT_ID
  CHROME_WEB_STORE_CLIENT_SECRET
  CHROME_WEB_STORE_REFRESH_TOKEN

Notes:
  - This script targets the fixed Midscene Chrome Web Store item.
  - It uploads the packaged zip, submits it for publishing, and waits until
    the submission reaches a review or published state.
EOF
}

log() {
  printf '%s\n' "$*"
}

debug() {
  if [[ "$VERBOSE" -eq 1 ]]; then
    printf '[debug] %s\n' "$*"
  fi
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    fail "Missing required environment variable: $name"
  fi
}

append_summary() {
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '%s\n' "$*" >>"$GITHUB_STEP_SUMMARY"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --zip-path)
      ZIP_PATH="${2:-}"
      shift 2
      ;;
    --timeout-seconds)
      TIMEOUT_SECONDS="${2:-}"
      shift 2
      ;;
    --poll-interval-seconds)
      POLL_INTERVAL_SECONDS="${2:-}"
      shift 2
      ;;
    --verbose)
      VERBOSE=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

if [[ -z "$ZIP_PATH" ]]; then
  usage
  fail "--zip-path is required"
fi

require_command curl
require_command jq
require_command unzip

require_env CHROME_WEB_STORE_PUBLISHER_ID
require_env CHROME_WEB_STORE_CLIENT_ID
require_env CHROME_WEB_STORE_CLIENT_SECRET
require_env CHROME_WEB_STORE_REFRESH_TOKEN

[[ -f "$ZIP_PATH" ]] || fail "Zip file does not exist: $ZIP_PATH"
[[ "$TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || fail "--timeout-seconds must be numeric"
[[ "$POLL_INTERVAL_SECONDS" =~ ^[0-9]+$ ]] || fail "--poll-interval-seconds must be numeric"
(( TIMEOUT_SECONDS > 0 )) || fail "--timeout-seconds must be greater than zero"
(( POLL_INTERVAL_SECONDS > 0 )) || fail "--poll-interval-seconds must be greater than zero"

readonly ITEM_NAME="publishers/${CHROME_WEB_STORE_PUBLISHER_ID}/items/${ITEM_ID}"
readonly STATUS_URL="https://chromewebstore.googleapis.com/v2/${ITEM_NAME}:fetchStatus"
readonly UPLOAD_URL="https://chromewebstore.googleapis.com/upload/v2/${ITEM_NAME}:upload"
readonly PUBLISH_URL="https://chromewebstore.googleapis.com/v2/${ITEM_NAME}:publish"

EXPECTED_CRX_VERSION="$(unzip -p "$ZIP_PATH" manifest.json | jq -er '.version')"

debug "Target item: $ITEM_NAME"
debug "Zip path: $ZIP_PATH"
debug "Expected extension version from manifest: $EXPECTED_CRX_VERSION"

ACCESS_TOKEN="$(
  curl --silent --show-error --fail-with-body \
    -X POST "https://oauth2.googleapis.com/token" \
    -d "client_id=${CHROME_WEB_STORE_CLIENT_ID}" \
    -d "client_secret=${CHROME_WEB_STORE_CLIENT_SECRET}" \
    -d "refresh_token=${CHROME_WEB_STORE_REFRESH_TOKEN}" \
    -d "grant_type=refresh_token" \
    | jq -er '.access_token'
)"

api_get() {
  local url="$1"
  curl --silent --show-error --fail-with-body \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    "$url"
}

api_post_json() {
  local url="$1"
  local body="$2"
  curl --silent --show-error --fail-with-body \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -X POST \
    -d "$body" \
    "$url"
}

wait_for_upload() {
  local deadline=$((SECONDS + TIMEOUT_SECONDS))
  local status_json=""
  local upload_state=""

  while (( SECONDS < deadline )); do
    status_json="$(api_get "$STATUS_URL")"
    upload_state="$(jq -r '.lastAsyncUploadState // "NOT_FOUND"' <<<"$status_json")"
    debug "Current upload state: $upload_state"

    case "$upload_state" in
      SUCCEEDED)
        return 0
        ;;
      IN_PROGRESS|NOT_FOUND)
        sleep "$POLL_INTERVAL_SECONDS"
        ;;
      FAILED)
        fail "Chrome Web Store upload failed: $status_json"
        ;;
      *)
        fail "Unexpected upload state: $upload_state"
        ;;
    esac
  done

  fail "Timed out waiting for Chrome Web Store upload to finish"
}

wait_for_publish_state() {
  local deadline=$((SECONDS + TIMEOUT_SECONDS))
  local status_json=""
  local submitted_state=""
  local submitted_version=""
  local published_state=""
  local published_version=""

  while (( SECONDS < deadline )); do
    status_json="$(api_get "$STATUS_URL")"
    submitted_state="$(jq -r '.submittedItemRevisionStatus.state // empty' <<<"$status_json")"
    submitted_version="$(jq -r '.submittedItemRevisionStatus.distributionChannels[0].crxVersion // empty' <<<"$status_json")"
    published_state="$(jq -r '.publishedItemRevisionStatus.state // empty' <<<"$status_json")"
    published_version="$(jq -r '.publishedItemRevisionStatus.distributionChannels[0].crxVersion // empty' <<<"$status_json")"

    debug "Submitted version/state: ${submitted_version:-<none>} / ${submitted_state:-<none>}"
    debug "Published version/state: ${published_version:-<none>} / ${published_state:-<none>}"

    if [[ "$submitted_version" == "$EXPECTED_CRX_VERSION" ]]; then
      case "$submitted_state" in
        PENDING_REVIEW|STAGED)
          log "Chrome Web Store submission accepted: version ${submitted_version}, state ${submitted_state}"
          append_summary "### Chrome Web Store"
          append_summary "- Item: \`${ITEM_ID}\`"
          append_summary "- Uploaded version: \`${EXPECTED_CRX_VERSION}\`"
          append_summary "- Submission state: \`${submitted_state}\`"
          return 0
          ;;
        REJECTED|CANCELLED)
          fail "Chrome Web Store submission did not succeed: $status_json"
          ;;
      esac
    fi

    if [[ "$published_version" == "$EXPECTED_CRX_VERSION" ]]; then
      case "$published_state" in
        PUBLISHED|PUBLISHED_TO_TESTERS)
          log "Chrome Web Store publish complete: version ${published_version}, state ${published_state}"
          append_summary "### Chrome Web Store"
          append_summary "- Item: \`${ITEM_ID}\`"
          append_summary "- Published version: \`${published_version}\`"
          append_summary "- Published state: \`${published_state}\`"
          return 0
          ;;
      esac
    fi

    sleep "$POLL_INTERVAL_SECONDS"
  done

  fail "Timed out waiting for Chrome Web Store submission to reach a review or published state"
}

log "Uploading ${ZIP_PATH} to Chrome Web Store item ${ITEM_ID}"
UPLOAD_RESPONSE="$(
  curl --silent --show-error --fail-with-body \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -X POST \
    -T "$ZIP_PATH" \
    "$UPLOAD_URL"
)"

UPLOAD_STATE="$(jq -er '.uploadState' <<<"$UPLOAD_RESPONSE")"
UPLOADED_CRX_VERSION="$(jq -r '.crxVersion // empty' <<<"$UPLOAD_RESPONSE")"

if [[ -n "$UPLOADED_CRX_VERSION" ]]; then
  EXPECTED_CRX_VERSION="$UPLOADED_CRX_VERSION"
fi

log "Upload state: ${UPLOAD_STATE}"
debug "Upload response: $UPLOAD_RESPONSE"

case "$UPLOAD_STATE" in
  SUCCEEDED)
    ;;
  IN_PROGRESS)
    wait_for_upload
    ;;
  *)
    fail "Chrome Web Store upload failed: $UPLOAD_RESPONSE"
    ;;
esac

log "Submitting uploaded package for publishing"
PUBLISH_RESPONSE="$(api_post_json "$PUBLISH_URL" '{}')"
PUBLISH_STATE="$(jq -r '.state // empty' <<<"$PUBLISH_RESPONSE")"

debug "Publish response: $PUBLISH_RESPONSE"
if [[ "$PUBLISH_STATE" == "REJECTED" || "$PUBLISH_STATE" == "CANCELLED" ]]; then
  fail "Chrome Web Store publish request failed: $PUBLISH_RESPONSE"
fi

wait_for_publish_state
