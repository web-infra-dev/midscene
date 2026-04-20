#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

namespace midscene::rdp {

enum class RequestType {
  kConnect,
  kDisconnect,
  kScreenshot,
  kSize,
  kMouseMove,
  kMouseButton,
  kWheel,
  kKeyPress,
  kTypeText,
  kClearInput,
  kUnknown,
};

struct Size {
  int32_t width = 0;
  int32_t height = 0;
};

struct ConnectionConfig {
  std::string host;
  uint16_t port = 3389;
  std::string username;
  std::string password;
  std::string domain;
  bool admin_session = false;
  bool ignore_certificate = false;
  std::string security_protocol = "auto";
  int32_t desktop_width = 1280;
  int32_t desktop_height = 720;
};

struct RequestEnvelope {
  std::string id;
  RequestType type = RequestType::kUnknown;
  std::string raw_line;
};

struct ErrorPayload {
  std::string code;
  std::string message;
};

std::string RequestTypeToString(RequestType type);
std::optional<RequestType> ParseRequestType(std::string_view value);

}  // namespace midscene::rdp
