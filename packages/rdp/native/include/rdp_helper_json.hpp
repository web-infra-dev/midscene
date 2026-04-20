#pragma once

#include <optional>
#include <string>
#include <string_view>

#include "rdp_helper_protocol.hpp"

namespace midscene::rdp {

std::string EscapeJsonString(std::string_view value);
std::string ExtractRequestId(std::string_view line);
std::optional<RequestEnvelope> ParseRequestLine(std::string_view line);
std::string MakeErrorResponse(std::string_view request_id,
                              std::string_view code,
                              std::string_view message);
std::string MakeOkResponse(std::string_view request_id,
                           std::string_view raw_payload_json);

}  // namespace midscene::rdp
