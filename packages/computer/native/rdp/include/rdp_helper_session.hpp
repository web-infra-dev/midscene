#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <thread>
#include <vector>

#include <freerdp/client/rdpgfx.h>
#include <freerdp/codec/region.h>
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
  // Chain a frame-paint hook onto the update pipeline after GDI callbacks are
  // installed, so the session can tell when desktop pixels reach the primary
  // framebuffer.
  void HookEndPaint(rdpUpdate* update);
  void HookGraphicsFrames(RdpgfxClientContext* graphics);
  // Records that at least one paint has reached the local framebuffer and
  // wakes Connect().
  void MarkFramePainted();
  // Records a framebuffer update even when it is too blank or uniform to count
  // as the first informative frame.
  BOOL MarkFramebufferUpdated(const std::vector<RECTANGLE_16>& rectangles, Size size);
  bool HasPendingFramebufferRefresh() const;
  // Graphics decoding precedes the primary-buffer paint. A screenshot must
  // finish the frame already being decoded before copying that buffer.
  void MarkGraphicsFrameStarted();
  void MarkGraphicsFrameCompleted();
  bool HasFramePainted() const;
  BOOL CallOriginalEndPaint(rdpContext* context);
  // Mark the session as no longer active and wake any first-frame waiter.
  void SignalSessionInactive();

  FreeRdpSessionTransport(const FreeRdpSessionTransport&) = delete;
  FreeRdpSessionTransport& operator=(const FreeRdpSessionTransport&) = delete;

 private:
  friend struct MidsceneRdpContext;
  friend struct RdpScreenshotTestPeer;

  freerdp* instance_ = nullptr;
  std::thread event_thread_;
  mutable std::mutex mutex_;
  bool running_ = false;
  bool connected_ = false;
  bool gdi_initialized_ = false;
  // Number of desktop paints that have reached the local framebuffer. A fresh
  // RDP session exposes a zero-filled (all black) buffer until the first paint
  // is processed, so screenshots taken before this is > 0 would be blank.
  std::atomic<uint64_t> frames_painted_{0};
  // Number of valid framebuffer updates observed before the first informative
  // frame. This distinguishes a silent desktop from a blank or locked one.
  std::atomic<uint64_t> framebuffer_updates_{0};
  // One ordered graphics-channel decoder emits StartFrame/EndFrame callbacks.
  // Completion includes the paint and is published under frame_mutex_ to
  // avoid losing notifications while a screenshot starts waiting.
  std::atomic<uint64_t> graphics_frames_started_{0};
  std::atomic<uint64_t> graphics_frames_completed_{0};
  // Input dirties the remote snapshot. The next screenshot requests a full
  // refresh when negotiated, then waits for exact painted-region coverage.
  // Support/needed are protected by mutex_; region/sequence/size by frame_mutex_.
  bool refresh_supported_ = false;
  bool refresh_needed_ = false;
  std::atomic<bool> refresh_pending_{false};
  std::atomic<bool> refresh_size_changed_{false};
  std::atomic<uint64_t> refresh_completed_{0};
  bool refresh_repair_pending_ = false;
  bool refresh_repair_sent_ = false;
  uint64_t refresh_requested_ = 0;
  uint64_t refresh_after_graphics_frame_ = 0;
  Size refresh_size_{};
  REGION16 refreshed_region_{};
  // Tracks whether the session is still alive while Connect() waits for the
  // first frame, so a drop during that window wakes the wait immediately
  // instead of stalling until the timeout.
  std::atomic<bool> session_active_{false};
  std::condition_variable frame_cv_;
  std::mutex frame_mutex_;
  // Protected by frame_mutex_; use a monotonic clock for screenshot settling.
  std::chrono::steady_clock::time_point last_frame_update_{};
  // Protected by mutex_; reset for each new connection.
  bool first_screenshot_pending_ = true;
  pEndPaint original_end_paint_ = nullptr;
  uint16_t mouse_x_ = 0;
  uint16_t mouse_y_ = 0;
  std::string session_id_;
  std::optional<ErrorPayload> last_error_;

  void ResetStateLocked();
  void ClearSessionErrorLocked();
  bool RecordEventLoopFailureIfActive(bool operation_failed,
                                      bool disconnect_requested,
                                      std::string message);
  std::string LastFreeRdpErrorLocked() const;
  void StopInstance(bool preserve_session_error);
  void EventLoop();
};

}  // namespace midscene::rdp
