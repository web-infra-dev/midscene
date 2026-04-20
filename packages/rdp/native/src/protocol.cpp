#include "rdp_helper_protocol.hpp"

namespace midscene::rdp {

std::string RequestTypeToString(RequestType type) {
  switch (type) {
    case RequestType::kConnect:
      return "connect";
    case RequestType::kDisconnect:
      return "disconnect";
    case RequestType::kScreenshot:
      return "screenshot";
    case RequestType::kSize:
      return "size";
    case RequestType::kMouseMove:
      return "mouseMove";
    case RequestType::kMouseButton:
      return "mouseButton";
    case RequestType::kWheel:
      return "wheel";
    case RequestType::kKeyPress:
      return "keyPress";
    case RequestType::kTypeText:
      return "typeText";
    case RequestType::kClearInput:
      return "clearInput";
    case RequestType::kUnknown:
      return "unknown";
  }

  return "unknown";
}

std::optional<RequestType> ParseRequestType(std::string_view value) {
  if (value == "connect") {
    return RequestType::kConnect;
  }
  if (value == "disconnect") {
    return RequestType::kDisconnect;
  }
  if (value == "screenshot") {
    return RequestType::kScreenshot;
  }
  if (value == "size") {
    return RequestType::kSize;
  }
  if (value == "mouseMove") {
    return RequestType::kMouseMove;
  }
  if (value == "mouseButton") {
    return RequestType::kMouseButton;
  }
  if (value == "wheel") {
    return RequestType::kWheel;
  }
  if (value == "keyPress") {
    return RequestType::kKeyPress;
  }
  if (value == "typeText") {
    return RequestType::kTypeText;
  }
  if (value == "clearInput") {
    return RequestType::kClearInput;
  }
  return std::nullopt;
}

}  // namespace midscene::rdp
