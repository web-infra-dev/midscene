#include <algorithm>
#include <chrono>
#include <future>
#include <iostream>
#include <stdexcept>
#include <string>
#include <thread>

#include <freerdp/gdi/gdi.h>

#include "rdp_helper_framebuffer.hpp"
#include "rdp_helper_png.hpp"

namespace midscene::rdp {

// Supply a framebuffer without a Windows server, but exercise the real
// CaptureFrame(), paint notifications, locks, and disconnect wakeups.
struct RdpScreenshotTestPeer {
  FreeRdpSessionTransport transport;
  freerdp instance{};
  struct TestContext {
    MidsceneRdpContext base{};
    RdpScreenshotTestPeer* peer = nullptr;
  } test_context;
  MidsceneRdpContext& context = test_context.base;
  rdpUpdate update{};
  gdiBitmap primary{};
  GDI_DC dc{};
  GDI_WND window{};
  GDI_RGN invalid{};
  bool end_paint_ok = true;
  int end_paint_calls = 0;
  pEndPaint original_end_paint = nullptr;
  rdpGdi gdi{};
  std::vector<uint8_t> pixels;

  RdpScreenshotTestPeer() : pixels(68 * 16, 255) {
    gdi.width = 16;
    gdi.height = 16;
    gdi.stride = 68;  // Exercise row padding as well as pixel data.
    gdi.primary_buffer = pixels.data();
    context.context.gdi = &gdi;
    test_context.peer = this;
    context.owner = &transport;
    instance.context = &context.context;
    gdi.primary = &primary;
    primary.hdc = &dc;
    dc.hwnd = &window;
    window.invalid = &invalid;
    update.EndPaint = [](rdpContext* context) -> BOOL {
      auto& peer = *reinterpret_cast<TestContext*>(context)->peer;
      ++peer.end_paint_calls;
      peer.window.ninvalid = 0;
      peer.invalid.null = TRUE;
      return peer.end_paint_ok ? TRUE : FALSE;
    };
    original_end_paint = update.EndPaint;
    transport.HookEndPaint(&update);
    transport.instance_ = &instance;
    transport.connected_ = true;
    transport.running_ = true;
    transport.session_active_.store(true);
  }

  ~RdpScreenshotTestPeer() {
    // These FreeRDP structs belong to the fixture, not freerdp_new().
    transport.instance_ = nullptr;
  }

  void Paint(uint8_t color, int rows = 16) {
    std::lock_guard<std::mutex> lock(transport.mutex_);
    for (int y = 0; y < 16; ++y) {
      for (int x = 0; x < 16; ++x) {
        const size_t offset = y * gdi.stride + x * 4;
        std::fill_n(pixels.data() + offset, 3, y < rows ? color : 0);
      }
    }
    EndPaintLocked(true);
  }

  void EndPaintLocked(bool invalidated) {
    window.ninvalid = invalidated ? 1 : 0;
    invalid.null = invalidated ? FALSE : TRUE;
    update.EndPaint(&context.context);
  }

  void InformativePaint(bool invalidated = true) {
    std::lock_guard<std::mutex> lock(transport.mutex_);
    for (int y = 0; y < 16; ++y) {
      for (int x = 0; x < 16; ++x) {
        const auto offset = y * gdi.stride + x * 4;
        pixels[offset] = static_cast<uint8_t>(y * 16 + x);
        pixels[offset + 1] = 128;
      }
    }
    EndPaintLocked(invalidated);
  }

  std::unique_lock<std::mutex> HoldFrameNotificationLock() {
    return std::unique_lock<std::mutex>(transport.frame_mutex_);
  }

  uint64_t Updates() const {
    return transport.framebuffer_updates_.load();
  }

  void ResetConnection() {
    std::lock_guard<std::mutex> lock(transport.mutex_);
    transport.ResetStateLocked();
    transport.instance_ = &instance;
    transport.connected_ = true;
    transport.running_ = true;
    transport.session_active_.store(true);
    transport.original_end_paint_ = original_end_paint;
  }

  void LoseSession() {
    {
      std::lock_guard<std::mutex> lock(transport.mutex_);
      transport.connected_ = false;
      transport.last_error_ = ErrorPayload{"session_lost", "test disconnect"};
    }
    transport.SignalSessionInactive();
  }
};

}  // namespace midscene::rdp

namespace {

using namespace std::chrono_literals;
using midscene::rdp::RawFrame;
using midscene::rdp::RdpScreenshotTestPeer;

void Expect(bool condition, const char* message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}

bool HasColor(const RawFrame& frame, uint8_t color) {
  for (int y = 0; y < frame.size.height; ++y) {
    for (int x = 0; x < frame.size.width; ++x) {
      const size_t offset = y * frame.stride + x * 4;
      for (size_t channel = 0; channel < 3; ++channel) {
        if (frame.bgra[offset + channel] != color) {
          return false;
        }
      }
    }
  }
  return true;
}

uint32_t ReadUint32BigEndian(const std::vector<uint8_t>& bytes,
                             size_t offset) {
  return (static_cast<uint32_t>(bytes.at(offset)) << 24U) |
         (static_cast<uint32_t>(bytes.at(offset + 1)) << 16U) |
         (static_cast<uint32_t>(bytes.at(offset + 2)) << 8U) |
         static_cast<uint32_t>(bytes.at(offset + 3));
}

void TestPngTreatsBgrxPaddingAsOpaque() {
  RawFrame frame;
  frame.size = {1, 1};
  frame.stride = 4;
  frame.bgra = {0x11, 0x22, 0x33, 0x00};

  const auto png = midscene::rdp::EncodeFrameAsPng(frame);
  size_t offset = 8;
  while (offset + 12 <= png.size()) {
    const size_t length = ReadUint32BigEndian(png, offset);
    const std::string type(png.begin() + static_cast<std::ptrdiff_t>(offset + 4),
                           png.begin() + static_cast<std::ptrdiff_t>(offset + 8));
    if (type == "IDAT") {
      const size_t data_offset = offset + 8;
      // The encoder writes one stored DEFLATE block. Its scanline begins
      // after the two-byte zlib header and five-byte block header.
      Expect(length >= 12, "encoded PNG IDAT payload is unexpectedly short");
      Expect(png.at(data_offset + 7) == 0, "PNG scanline filter changed");
      Expect(png.at(data_offset + 8) == 0x33, "PNG red channel changed");
      Expect(png.at(data_offset + 9) == 0x22, "PNG green channel changed");
      Expect(png.at(data_offset + 10) == 0x11, "PNG blue channel changed");
      Expect(png.at(data_offset + 11) == 0xFF,
             "BGRX padding was exposed as transparent PNG alpha");
      return;
    }
    offset += 12 + length;
  }

  throw std::runtime_error("encoded PNG is missing IDAT");
}

void TestEndPaintPipeline() {
  RdpScreenshotTestPeer peer;
  peer.Paint(0);
  Expect(!peer.transport.HasFramePainted(), "black startup passed readiness");
  Expect(peer.Updates() == 1, "blank update was not recorded");
  peer.InformativePaint(false);
  Expect(!peer.transport.HasFramePainted(), "non-invalidated paint passed readiness");
  Expect(peer.Updates() == 1, "non-invalidated paint counted as an update");
  peer.end_paint_ok = false;
  peer.InformativePaint();
  Expect(!peer.transport.HasFramePainted(), "failed original callback passed readiness");
  Expect(peer.Updates() == 1, "failed callback counted as an update");
  peer.end_paint_ok = true;
  peer.InformativePaint();
  Expect(peer.transport.HasFramePainted(), "informative paint did not pass readiness");
  Expect(peer.Updates() == 2, "invalidation was lost after original callback cleared it");
  peer.Paint(0);
  Expect(peer.Updates() == 3, "later black paint did not update settling");
  Expect(peer.end_paint_calls == 5, "original EndPaint was not chained exactly once");
  Expect(HasColor(peer.transport.CaptureFrame(), 0), "live black pixels were lost");
}

void TestScreenshotWakeTimes() {
  const auto start = std::chrono::steady_clock::time_point{} + 10s;
  using midscene::rdp::ScreenshotWakeAt;
  Expect(ScreenshotWakeAt(start, start - 1s) == start + 300ms,
         "first screenshot must wait even after an old paint");
  Expect(ScreenshotWakeAt(start, start + 250ms) == start + 550ms,
         "new paint must extend the quiet window");
  Expect(ScreenshotWakeAt(start, start + 2900ms) == start + 3s,
         "continuous updates must not extend the fixed deadline");
}

void TestPartialFirstPaint() {
  RdpScreenshotTestPeer peer;
  peer.InformativePaint();
  peer.Paint(64, 2);
  // The first informative frame is partial; later pixels must replace it even
  // if both paints arrive before CaptureFrame starts (the old cache bug).
  peer.Paint(192);
  const auto frame = peer.transport.CaptureFrame();
  Expect(HasColor(frame, 192), "first screenshot returned a partial old paint");
}

void TestLaterScreenshotsDoNotWait() {
  RdpScreenshotTestPeer peer;
  peer.InformativePaint();
  peer.Paint(64);
  peer.transport.CaptureFrame();
  for (const uint8_t color : {0, 128}) {
    peer.Paint(color);
    // The fast path must not enter the settling section at all. Holding its
    // mutex detects that structurally, without a tight wall-time assertion.
    auto notification_lock = peer.HoldFrameNotificationLock();
    auto capture = std::async(std::launch::async,
                             [&] { return peer.transport.CaptureFrame(); });
    const auto status = capture.wait_for(5s);
    notification_lock.unlock();
    Expect(status == std::future_status::ready,
           "later screenshot unnecessarily entered settling");
    Expect(HasColor(capture.get(), color), "later screenshot returned stale pixels");
  }
}

void TestContinuousUpdatesHaveDeadline() {
  RdpScreenshotTestPeer peer;
  peer.InformativePaint();
  peer.Paint(128);
  std::atomic<bool> stop{false};
  auto painting = std::async(std::launch::async, [&] {
    while (!stop.load()) {
      peer.Paint(128);
      std::this_thread::sleep_for(30ms);
    }
  });
  auto capture = std::async(std::launch::async,
                            [&] { return peer.transport.CaptureFrame(); });
  const auto status = capture.wait_for(5s);
  stop.store(true);
  painting.get();
  Expect(status == std::future_status::ready,
         "continuous updates extended the screenshot deadline");
  Expect(HasColor(capture.get(), 128), "deadline did not return the live frame");
}

void TestBlackFirstScreenshot() {
  RdpScreenshotTestPeer peer;
  peer.InformativePaint();
  peer.Paint(0);
  Expect(HasColor(peer.transport.CaptureFrame(), 0),
         "black current framebuffer should be returned after initial settling");
}

void TestReconnectResetsSettling() {
  RdpScreenshotTestPeer peer;
  peer.InformativePaint();
  peer.Paint(64);
  peer.transport.CaptureFrame();
  peer.ResetConnection();
  peer.InformativePaint();
  peer.Paint(128);
  auto capture = std::async(std::launch::async,
                           [&] { return peer.transport.CaptureFrame(); });
  Expect(capture.wait_for(50ms) == std::future_status::timeout,
         "new connection did not restore first-screenshot settling");
  Expect(HasColor(capture.get(), 128), "new connection returned old pixels");
}

void TestDisconnectWakesScreenshot(uint8_t color) {
  RdpScreenshotTestPeer peer;
  peer.InformativePaint();
  peer.Paint(color);
  auto capture = std::async(std::launch::async, [&] {
    try {
      peer.transport.CaptureFrame();
      return std::string();
    } catch (const std::exception& error) {
      return std::string(error.what());
    }
  });
  Expect(capture.wait_for(50ms) == std::future_status::timeout,
         "screenshot did not wait for framebuffer updates");
  peer.LoseSession();
  Expect(capture.wait_for(1s) == std::future_status::ready,
         "session loss did not wake the screenshot waiter");
  Expect(capture.get().find("test disconnect") != std::string::npos,
         "screenshot lost the session failure reason");
}

void TestInvalidFramebuffer() {
  for (int invalid_case = 0; invalid_case < 4; ++invalid_case) {
    RdpScreenshotTestPeer peer;
  peer.InformativePaint();
    peer.Paint(64);
    switch (invalid_case) {
      case 0: peer.gdi.primary_buffer = nullptr; break;
      case 1: peer.gdi.width = 0; break;
      case 2: peer.gdi.height = 0; break;
      case 3: peer.gdi.stride = 4; break;
    }
    std::string error_message;
    try {
      peer.transport.CaptureFrame();
    } catch (const std::exception& error) {
      error_message = error.what();
    }
    Expect(error_message == "Remote framebuffer is empty or invalid",
           "invalid framebuffer layout was not rejected");
  }
}

}  // namespace

int main() {
  try {
    TestPngTreatsBgrxPaddingAsOpaque();
    TestEndPaintPipeline();
    TestScreenshotWakeTimes();
    TestPartialFirstPaint();
    TestLaterScreenshotsDoNotWait();
    TestContinuousUpdatesHaveDeadline();
    TestBlackFirstScreenshot();
    TestReconnectResetsSettling();
    TestDisconnectWakesScreenshot(0);
    TestDisconnectWakesScreenshot(64);
    TestInvalidFramebuffer();
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
