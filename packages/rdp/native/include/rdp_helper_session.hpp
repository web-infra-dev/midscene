#pragma once

#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>

#include "rdp_helper_protocol.hpp"

namespace midscene::rdp {

struct ConnectionInfo {
  std::string session_id;
  std::string server;
  Size size;
};

struct RawFrame {
  std::vector<uint8_t> bgra;
  Size size;
  size_t stride = 0;
};

class SessionTransport {
 public:
  virtual ~SessionTransport() = default;

  virtual ConnectionInfo Connect(const ConnectionConfig& config) = 0;
  virtual void Disconnect() = 0;
  virtual RawFrame CaptureFrame() = 0;
  virtual Size GetSize() = 0;
  virtual void MouseMove(uint16_t x, uint16_t y) = 0;
  virtual void MouseButton(std::string_view button, std::string_view action) = 0;
  virtual void Wheel(std::string_view direction, int32_t amount) = 0;
  virtual void KeyPress(std::string_view key_name) = 0;
  virtual void TypeText(std::string_view text) = 0;
  virtual void ClearInput() = 0;
};

class UnsupportedSessionTransport final : public SessionTransport {
 public:
  ConnectionInfo Connect(const ConnectionConfig& config) override;
  void Disconnect() override;
  RawFrame CaptureFrame() override;
  Size GetSize() override;
  void MouseMove(uint16_t x, uint16_t y) override;
  void MouseButton(std::string_view button, std::string_view action) override;
  void Wheel(std::string_view direction, int32_t amount) override;
  void KeyPress(std::string_view key_name) override;
  void TypeText(std::string_view text) override;
  void ClearInput() override;

 private:
  [[noreturn]] void ThrowUnsupported() const;
};

}  // namespace midscene::rdp
