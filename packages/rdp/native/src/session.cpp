#include "rdp_helper_session.hpp"

namespace midscene::rdp {

ConnectionInfo UnsupportedSessionTransport::Connect(const ConnectionConfig& config) {
  static_cast<void>(config);
  ThrowUnsupported();
}

void UnsupportedSessionTransport::Disconnect() {
  ThrowUnsupported();
}

RawFrame UnsupportedSessionTransport::CaptureFrame() {
  ThrowUnsupported();
}

Size UnsupportedSessionTransport::GetSize() {
  ThrowUnsupported();
}

void UnsupportedSessionTransport::MouseMove(uint16_t x, uint16_t y) {
  static_cast<void>(x);
  static_cast<void>(y);
  ThrowUnsupported();
}

void UnsupportedSessionTransport::MouseButton(std::string_view button,
                                              std::string_view action) {
  static_cast<void>(button);
  static_cast<void>(action);
  ThrowUnsupported();
}

void UnsupportedSessionTransport::Wheel(std::string_view direction, int32_t amount) {
  static_cast<void>(direction);
  static_cast<void>(amount);
  ThrowUnsupported();
}

void UnsupportedSessionTransport::KeyPress(std::string_view key_name) {
  static_cast<void>(key_name);
  ThrowUnsupported();
}

void UnsupportedSessionTransport::TypeText(std::string_view text) {
  static_cast<void>(text);
  ThrowUnsupported();
}

void UnsupportedSessionTransport::ClearInput() {
  ThrowUnsupported();
}

void UnsupportedSessionTransport::ThrowUnsupported() const {
  throw std::runtime_error(
      "Cross-platform helper scaffold is not wired to a concrete FreeRDP transport yet.");
}

}  // namespace midscene::rdp
