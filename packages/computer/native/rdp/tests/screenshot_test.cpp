#include <algorithm>
#include <chrono>
#include <future>
#include <iostream>
#include <stdexcept>
#include <string>
#include <thread>

#include <freerdp/gdi/gdi.h>

#include "rdp_helper_session.hpp"

namespace midscene::rdp {

// Supply a framebuffer without a Windows server, but exercise the real
// CaptureFrame(), paint notifications, locks, and disconnect wakeups.
struct RdpScreenshotTestPeer {
  FreeRdpSessionTransport transport;
  freerdp instance{};
  rdpContext context{};
  rdpGdi gdi{};
  std::vector<uint8_t> pixels;

  RdpScreenshotTestPeer() : pixels(36 * 8, 255) {
    gdi.width = 8;
    gdi.height = 8;
    gdi.stride = 36;  // Exercise row padding as well as pixel data.
    gdi.primary_buffer = pixels.data();
    context.gdi = &gdi;
    instance.context = &context;
    transport.instance_ = &instance;
    transport.connected_ = true;
    transport.running_ = true;
    transport.session_active_.store(true);
  }

  ~RdpScreenshotTestPeer() {
    // These FreeRDP structs belong to the fixture, not freerdp_new().
    transport.instance_ = nullptr;
  }

  void Paint(uint8_t color, int rows = 8) {
    std::lock_guard<std::mutex> lock(transport.mutex_);
    for (int y = 0; y < 8; ++y) {
      for (int x = 0; x < 8; ++x) {
        const size_t offset = y * gdi.stride + x * 4;
        std::fill_n(pixels.data() + offset, 3, y < rows ? color : 0);
      }
    }
    transport.MarkFramebufferUpdated();
    transport.MarkFramePainted();
  }

  void ResetConnection() {
    std::lock_guard<std::mutex> lock(transport.mutex_);
    transport.ResetStateLocked();
    transport.instance_ = &instance;
    transport.connected_ = true;
    transport.running_ = true;
    transport.session_active_.store(true);
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

void TestPartialFirstPaint() {
  RdpScreenshotTestPeer peer;
  peer.Paint(64, 2);
  auto painting = std::async(std::launch::async, [&] {
    // Keep painting beyond the initial quiet window: each update must extend
    // settling, while still letting the event-loop mutex make progress.
    for (int rows = 3; rows <= 6; ++rows) {
      std::this_thread::sleep_for(100ms);
      peer.Paint(128, rows);
    }
    std::this_thread::sleep_for(100ms);
    peer.Paint(192);
  });
  const auto frame = peer.transport.CaptureFrame();
  painting.get();
  Expect(HasColor(frame, 192), "first screenshot returned a partial old paint");
}

void TestLaterScreenshotsDoNotWait() {
  RdpScreenshotTestPeer peer;
  peer.Paint(64);
  peer.transport.CaptureFrame();
  for (const uint8_t color : {0, 128}) {
    peer.Paint(color);
    auto capture = std::async(std::launch::async,
                             [&] { return peer.transport.CaptureFrame(); });
    Expect(capture.wait_for(200ms) == std::future_status::ready,
           "later screenshot unnecessarily waited for settling");
    Expect(HasColor(capture.get(), color), "later screenshot returned stale pixels");
  }
}

void TestContinuousUpdatesHaveDeadline() {
  RdpScreenshotTestPeer peer;
  peer.Paint(64);
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
  peer.Paint(0);
  Expect(HasColor(peer.transport.CaptureFrame(), 0),
         "black current framebuffer should be returned after initial settling");
}

void TestReconnectResetsSettling() {
  RdpScreenshotTestPeer peer;
  peer.Paint(64);
  peer.transport.CaptureFrame();
  peer.ResetConnection();
  peer.Paint(128);
  auto capture = std::async(std::launch::async,
                           [&] { return peer.transport.CaptureFrame(); });
  Expect(capture.wait_for(50ms) == std::future_status::timeout,
         "new connection did not restore first-screenshot settling");
  Expect(HasColor(capture.get(), 128), "new connection returned old pixels");
}

void TestDisconnectWakesScreenshot(uint8_t color) {
  RdpScreenshotTestPeer peer;
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
