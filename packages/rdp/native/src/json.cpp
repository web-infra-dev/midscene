#include "rdp_helper_json.hpp"

#include <sstream>

namespace midscene::rdp {

namespace {

std::optional<std::string> FindQuotedField(std::string_view line,
                                           std::string_view field_name) {
  const std::string needle = "\"" + std::string(field_name) + "\"";
  const size_t key_position = line.find(needle);
  if (key_position == std::string_view::npos) {
    return std::nullopt;
  }

  const size_t colon_position = line.find(':', key_position + needle.size());
  if (colon_position == std::string_view::npos) {
    return std::nullopt;
  }

  const size_t first_quote = line.find('"', colon_position + 1);
  if (first_quote == std::string_view::npos) {
    return std::nullopt;
  }

  const size_t second_quote = line.find('"', first_quote + 1);
  if (second_quote == std::string_view::npos) {
    return std::nullopt;
  }

  return std::string(line.substr(first_quote + 1, second_quote - first_quote - 1));
}

}  // namespace

std::string EscapeJsonString(std::string_view value) {
  std::ostringstream escaped;
  for (const char ch : value) {
    switch (ch) {
      case '\\':
        escaped << "\\\\";
        break;
      case '"':
        escaped << "\\\"";
        break;
      case '\n':
        escaped << "\\n";
        break;
      case '\r':
        escaped << "\\r";
        break;
      case '\t':
        escaped << "\\t";
        break;
      default:
        escaped << ch;
        break;
    }
  }
  return escaped.str();
}

std::string ExtractRequestId(std::string_view line) {
  const auto request_id = FindQuotedField(line, "id");
  return request_id.value_or("");
}

std::optional<RequestEnvelope> ParseRequestLine(std::string_view line) {
  const auto request_type = FindQuotedField(line, "type");
  if (!request_type.has_value()) {
    return std::nullopt;
  }

  return RequestEnvelope{
      ExtractRequestId(line),
      ParseRequestType(*request_type).value_or(RequestType::kUnknown),
      std::string(line),
  };
}

std::string MakeErrorResponse(std::string_view request_id,
                              std::string_view code,
                              std::string_view message) {
  std::ostringstream response;
  response << "{\"id\":\"" << EscapeJsonString(request_id)
           << "\",\"ok\":false,\"error\":{\"code\":\"" << EscapeJsonString(code)
           << "\",\"message\":\"" << EscapeJsonString(message) << "\"}}";
  return response.str();
}

std::string MakeOkResponse(std::string_view request_id,
                           std::string_view raw_payload_json) {
  std::ostringstream response;
  response << "{\"id\":\"" << EscapeJsonString(request_id)
           << "\",\"ok\":true,\"payload\":" << raw_payload_json << "}";
  return response.str();
}

}  // namespace midscene::rdp
