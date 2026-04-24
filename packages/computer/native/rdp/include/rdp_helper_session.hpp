#pragma once

#include <cstdint>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <thread>
#include <vector>

#include <freerdp/freerdp.h>

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
  virtual void Wheel(std::string_view direction,
                     int32_t amount,
                     std::optional<uint16_t> x,
                     std::optional<uint16_t> y) = 0;
  virtual void KeyPress(std::string_view key_name) = 0;
  virtual void TypeText(std::string_view text) = 0;
  virtual void ClearInput() = 0;
  virtual bool IsConnected() const = 0;
  virtual std::optional<ErrorPayload> LastError() const = 0;
};

class FreeRdpSessionTransport final : public SessionTransport {
 public:
  FreeRdpSessionTransport();
  ~FreeRdpSessionTransport() override;

  ConnectionInfo Connect(const ConnectionConfig& config) override;
  void Disconnect() override;
  RawFrame CaptureFrame() override;
  Size GetSize() override;
  void MouseMove(uint16_t x, uint16_t y) override;
  void MouseButton(std::string_view button, std::string_view action) override;
  void Wheel(std::string_view direction,
             int32_t amount,
             std::optional<uint16_t> x,
             std::optional<uint16_t> y) override;
  void KeyPress(std::string_view key_name) override;
  void TypeText(std::string_view text) override;
  void ClearInput() override;
  bool IsConnected() const override;
  std::optional<ErrorPayload> LastError() const override;
  void MarkGdiInitialized();

  FreeRdpSessionTransport(const FreeRdpSessionTransport&) = delete;
  FreeRdpSessionTransport& operator=(const FreeRdpSessionTransport&) = delete;

 private:
  friend struct MidsceneRdpContext;

  freerdp* instance_ = nullptr;
  std::thread event_thread_;
  mutable std::mutex mutex_;
  bool running_ = false;
  bool connected_ = false;
  bool gdi_initialized_ = false;
  uint16_t mouse_x_ = 0;
  uint16_t mouse_y_ = 0;
  std::string session_id_;
  std::optional<ErrorPayload> last_error_;

  void ResetStateLocked();
  void ClearSessionErrorLocked();
  void SetSessionError(std::string message, std::string code);
  std::string LastFreeRdpErrorLocked() const;
  void StopInstance(bool preserve_session_error);
  void EventLoop();
};

}  // namespace midscene::rdp
