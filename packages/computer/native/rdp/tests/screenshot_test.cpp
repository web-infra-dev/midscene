#include <algorithm>
#include <chrono>
#include <future>
#include <iostream>
#include <stdexcept>
#include <string>
#include <thread>

#include <freerdp/gdi/gdi.h>
#include <freerdp/input.h>
#include <freerdp/peer.h>

#include "rdp_helper_framebuffer.hpp"
#include "rdp_helper_png.hpp"

namespace midscene::rdp {

// Supply a framebuffer without a Windows server, but exercise the real
// CaptureFrame(), paint notifications, locks, and disconnect wakeups.
struct RdpScreenshotTestPeer {
  static freerdp* CreateUpdateInstance() {
    auto* instance = freerdp_new();
    if (!instance || !freerdp_context_new(instance)) {
      freerdp_free(instance);
      throw std::runtime_error("Failed to initialize test update pipeline");
    }
    // Use the public state API to make the locally allocated input interface
    // active. Its callbacks are stubbed below; no network socket is opened.
    auto* state_peer = freerdp_peer_new(-1);
    if (!state_peer) {
      freerdp_context_free(instance);
      freerdp_free(instance);
      throw std::runtime_error("Failed to initialize test connection state");
    }
    state_peer->context = instance->context;
    const BOOL active = state_peer->SetState(state_peer, CONNECTION_STATE_ACTIVE);
    freerdp_peer_free(state_peer);
    if (!active) {
      freerdp_context_free(instance);
      freerdp_free(instance);
      throw std::runtime_error("Failed to activate test connection state");
    }
    return instance;
  }
  FreeRdpSessionTransport transport;
  freerdp* update_instance = CreateUpdateInstance();
  freerdp instance{};
  struct TestContext {
    MidsceneRdpContext base{};
    RdpScreenshotTestPeer* peer = nullptr;
  } test_context;
  MidsceneRdpContext& context = test_context.base;
  rdpUpdate& update = *update_instance->context->update;
  gdiBitmap primary{};
  GDI_DC dc{};
  GDI_WND window{};
  GDI_RGN invalid{};
  bool end_paint_ok = true;
  int end_paint_calls = 0;
  pEndPaint original_end_paint = nullptr;
  rdpGdi gdi{};
  rdpInput& input = *update_instance->context->input;
  std::mutex refresh_request_mutex;
  std::condition_variable refresh_request_cv;
  unsigned refresh_requests = 0;
  RECTANGLE_16 refresh_area{};
  std::vector<RECTANGLE_16> refresh_areas;
  bool refresh_request_ok = true;
  RdpgfxClientContext graphics{};
  int graphics_start_calls = 0;
  int graphics_end_calls = 0;
  bool graphics_end_ok = true;
  uint8_t decoded_color = 192;
  std::vector<uint8_t> pixels;

  RdpScreenshotTestPeer() : pixels(68 * 16, 255) {
    gdi.width = 16;
    gdi.height = 16;
    gdi.stride = 68;  // Exercise row padding as well as pixel data.
    gdi.primary_buffer = pixels.data();
    context.context.gdi = &gdi;
    gdi.context = &context.context;
    context.context.update = &update;
    context.context.settings = update_instance->context->settings;
    input.MouseEvent = [](rdpInput*, UINT16, UINT16, UINT16) -> BOOL { return TRUE; };
    input.KeyboardEvent = [](rdpInput*, UINT16, UINT8) -> BOOL { return TRUE; };
    input.UnicodeKeyboardEvent = [](rdpInput*, UINT16, UINT16) -> BOOL { return TRUE; };
    context.context.input = &input;
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
    freerdp_context_free(update_instance);
    freerdp_free(update_instance);
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
    invalid.x = 0;
    invalid.y = 0;
    invalid.w = gdi.width;
    invalid.h = gdi.height;
    update.EndPaint(&context.context);
  }

  void EnableRefresh(bool supported = true) {
    transport.refresh_supported_ = supported;
    update.RefreshRect = [](rdpContext* context, BYTE count,
                             const RECTANGLE_16* areas) -> BOOL {
      auto& peer = *reinterpret_cast<TestContext*>(context)->peer;
      {
        std::lock_guard<std::mutex> lock(peer.refresh_request_mutex);
        if (count == 0) return FALSE;
        peer.refresh_area = areas[0];
        peer.refresh_areas.assign(areas, areas + count);
        ++peer.refresh_requests;
      }
      peer.refresh_request_cv.notify_all();
      return peer.refresh_request_ok ? TRUE : FALSE;
    };
  }

  bool WaitForRefresh(unsigned count) {
    std::unique_lock<std::mutex> lock(refresh_request_mutex);
    return refresh_request_cv.wait_for(lock, std::chrono::seconds(1),
                                      [&] { return refresh_requests >= count; });
  }

  void PaintRegion(uint8_t color, RECTANGLE_16 area) {
    std::lock_guard<std::mutex> lock(transport.mutex_);
    for (int y = area.top; y < area.bottom; ++y) {
      for (int x = area.left; x < area.right; ++x) {
        std::fill_n(pixels.data() + y * gdi.stride + x * 4, 3, color);
      }
    }
    invalid.x = area.left;
    invalid.y = area.top;
    invalid.w = area.right - area.left;
    invalid.h = area.bottom - area.top;
    invalid.null = FALSE;
    window.ninvalid = 1;
    update.EndPaint(&context.context);
  }

  void PaintDisjointCorners(uint8_t color) {
    std::lock_guard<std::mutex> lock(transport.mutex_);
    std::fill_n(pixels.data(), 3, color);
    std::fill_n(pixels.data() + 15 * gdi.stride + 15 * 4, 3, color);
    GDI_RGN areas[2]{};
    areas[0].w = areas[0].h = 1;
    areas[1].x = areas[1].y = 15;
    areas[1].w = areas[1].h = 1;
    invalid.x = invalid.y = 0;
    invalid.w = invalid.h = 16;
    invalid.null = FALSE;
    window.ninvalid = 2;
    window.cinvalid = areas;
    update.EndPaint(&context.context);
    window.cinvalid = nullptr;
  }

  void ResizeWidth(int width) {
    std::lock_guard<std::mutex> lock(transport.mutex_);
    gdi.width = width;
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

  void HookGraphics() {
    graphics.custom = &gdi;
    graphics.StartFrame = [](RdpgfxClientContext* graphics,
                             const RDPGFX_START_FRAME_PDU*) -> UINT {
      auto* gdi = static_cast<rdpGdi*>(graphics->custom);
      auto& peer = *reinterpret_cast<TestContext*>(gdi->context)->peer;
      ++peer.graphics_start_calls;
      return CHANNEL_RC_OK;
    };
    graphics.EndFrame = [](RdpgfxClientContext* graphics,
                           const RDPGFX_END_FRAME_PDU*) -> UINT {
      auto* gdi = static_cast<rdpGdi*>(graphics->custom);
      auto& peer = *reinterpret_cast<TestContext*>(gdi->context)->peer;
      ++peer.graphics_end_calls;
      if (!peer.graphics_end_ok) {
        return ERROR_INTERNAL_ERROR;
      }
      peer.Paint(peer.decoded_color);
      return CHANNEL_RC_OK;
    };
    transport.HookGraphicsFrames(&graphics);
  }

  UINT StartGraphics() {
    RDPGFX_START_FRAME_PDU frame{};
    return graphics.StartFrame(&graphics, &frame);
  }

  UINT EndGraphics() {
    RDPGFX_END_FRAME_PDU frame{};
    return graphics.EndFrame(&graphics, &frame);
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

void TestPngChecksumsAcrossBlockBoundaries() {
  // Exercise Adler summation boundaries and multiple stored DEFLATE blocks.
  // White pixels give the largest possible checksum sums.
  for (const int width : {1, 1388, 1389, 16383, 16384}) {
    RawFrame frame;
    frame.size = {width, 2};
    frame.stride = static_cast<size_t>(width) * 4 + 8;
    frame.bgra.assign(frame.stride * frame.size.height, 255);
    const auto png = midscene::rdp::EncodeFrameAsPng(frame);
    bool found_image = false;
    size_t offset = 8;
    while (offset + 12 <= png.size()) {
      const size_t length = ReadUint32BigEndian(png, offset);
      Expect(length <= png.size() - offset - 12, "PNG chunk is truncated");
      uint32_t crc = 0xFFFFFFFFU;
      for (size_t index = offset + 4; index < offset + 8 + length; ++index) {
        crc ^= png.at(index);
        for (int bit = 0; bit < 8; ++bit) {
          crc = (crc & 1U) ? (crc >> 1U) ^ 0xEDB88320U : crc >> 1U;
        }
      }
      Expect(ReadUint32BigEndian(png, offset + 8 + length) == (crc ^ 0xFFFFFFFFU),
             "PNG chunk CRC mismatch");

      const std::string type(png.begin() + static_cast<std::ptrdiff_t>(offset + 4),
                             png.begin() + static_cast<std::ptrdiff_t>(offset + 8));
      if (type == "IDAT") {
        found_image = true;
        std::vector<uint8_t> scanlines;
        const size_t checksum_offset = offset + 8 + length - 4;
        size_t block = offset + 10;  // Skip the zlib header.
        bool final_block = false;
        while (!final_block) {
          Expect(block + 5 <= checksum_offset, "DEFLATE block is truncated");
          const uint8_t flags = png.at(block);
          Expect(flags == 0 || flags == 1, "unexpected DEFLATE block type");
          final_block = flags == 1;
          const uint16_t size = png.at(block + 1) | (png.at(block + 2) << 8U);
          const uint16_t inverted = png.at(block + 3) | (png.at(block + 4) << 8U);
          Expect(static_cast<uint16_t>(~size) == inverted, "invalid DEFLATE length");
          block += 5;
          Expect(size <= checksum_offset - block, "DEFLATE payload is truncated");
          scanlines.insert(scanlines.end(), png.begin() + block, png.begin() + block + size);
          block += size;
        }
        Expect(block == checksum_offset, "unexpected bytes after final DEFLATE block");
        const size_t row_length = 1 + static_cast<size_t>(width) * 4;
        Expect(scanlines.size() == row_length * 2, "PNG included framebuffer row padding");
        uint32_t a = 1;
        uint32_t b = 0;
        for (size_t index = 0; index < scanlines.size(); ++index) {
          Expect(scanlines[index] == (index % row_length == 0 ? 0 : 255),
                 "PNG scanline pixels changed");
          a = (a + scanlines[index]) % 65521;
          b = (b + a) % 65521;
        }
        Expect(ReadUint32BigEndian(png, checksum_offset) == ((b << 16U) | a),
               "PNG Adler checksum mismatch");
      }
      offset += length + 12;
    }
    Expect(found_image && offset == png.size(), "PNG chunk stream is incomplete");
  }
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

void TestScreenshotWaitsForChannelPaint() {
  RdpScreenshotTestPeer peer;
  peer.InformativePaint();
  peer.Paint(64);
  peer.transport.CaptureFrame();

  // A graphics-channel thread holds the FreeRDP update lock, rather than the
  // transport mutex. A screenshot must wait for the entire paint to finish.
  rdp_update_lock(&peer.update);
  peer.pixels.front() = 192;
  auto capture = std::async(std::launch::async,
                           [&] { return peer.transport.CaptureFrame(); });
  const auto status = capture.wait_for(50ms);
  for (int y = 0; y < 16; ++y) {
    for (int x = 0; x < 16; ++x) {
      std::fill_n(peer.pixels.data() + y * peer.gdi.stride + x * 4, 3, 192);
    }
  }
  rdp_update_unlock(&peer.update);
  Expect(status == std::future_status::timeout,
         "screenshot raced a graphics-channel paint");
  Expect(capture.wait_for(5s) == std::future_status::ready,
         "completed graphics-channel paint did not release screenshot");
  Expect(HasColor(capture.get(), 192),
         "screenshot returned a partially painted graphics frame");
}

void TestSizeWaitsForChannelResize() {
  RdpScreenshotTestPeer peer;
  rdp_update_lock(&peer.update);
  peer.gdi.width = 32;
  auto size = std::async(std::launch::async,
                        [&] { return peer.transport.GetSize(); });
  const auto status = size.wait_for(50ms);
  peer.gdi.height = 8;
  rdp_update_unlock(&peer.update);
  Expect(status == std::future_status::timeout,
         "size query raced a graphics-channel resize");
  const auto resized = size.get();
  Expect(resized.width == 32 && resized.height == 8,
         "size query returned mixed desktop dimensions");
}

void TestScreenshotWaitsForDecodingFrame() {
  RdpScreenshotTestPeer peer;
  peer.InformativePaint();
  peer.Paint(64);
  peer.transport.CaptureFrame();
  peer.HookGraphics();
  Expect(peer.StartGraphics() == CHANNEL_RC_OK, "graphics StartFrame failed");
  // No update lock is held during surface decoding. The old screenshot path
  // would immediately copy 64 here, before EndFrame presents the new pixels.
  auto capture = std::async(std::launch::async,
                           [&] { return peer.transport.CaptureFrame(); });
  const auto status = capture.wait_for(50ms);
  Expect(peer.EndGraphics() == CHANNEL_RC_OK, "graphics EndFrame failed");
  // A later frame stays unfinished; it must not extend this request's target.
  peer.StartGraphics();
  Expect(status == std::future_status::timeout,
         "screenshot returned the previous frame during graphics decoding");
  Expect(capture.wait_for(1s) == std::future_status::ready,
         "later graphics frame extended screenshot waiting");
  Expect(HasColor(capture.get(), 192), "screenshot missed decoded graphics pixels");
  peer.EndGraphics();
  Expect(peer.graphics_start_calls == 2 && peer.graphics_end_calls == 2,
         "graphics callbacks were not chained exactly once");
}

void TestFailedGraphicsFrameWakesOnDisconnect() {
  RdpScreenshotTestPeer peer;
  peer.InformativePaint();
  peer.Paint(64);
  peer.transport.CaptureFrame();
  peer.HookGraphics();
  peer.StartGraphics();
  auto capture = std::async(std::launch::async, [&] {
    try {
      peer.transport.CaptureFrame();
      return std::string();
    } catch (const std::exception& error) {
      return std::string(error.what());
    }
  });
  Expect(capture.wait_for(50ms) == std::future_status::timeout,
         "screenshot did not wait for pending graphics frame");
  peer.graphics_end_ok = false;
  Expect(peer.EndGraphics() == ERROR_INTERNAL_ERROR,
         "graphics callback failure was swallowed");
  Expect(capture.wait_for(50ms) == std::future_status::timeout,
         "failed graphics frame was reported as complete");
  peer.LoseSession();
  Expect(capture.wait_for(1s) == std::future_status::ready,
         "disconnect did not wake graphics-frame waiter");
  Expect(capture.get().find("test disconnect") != std::string::npos,
         "graphics-frame waiter lost disconnect reason");
}

void TestUnfinishedGraphicsFrameTimesOut() {
  RdpScreenshotTestPeer peer;
  peer.InformativePaint();
  peer.Paint(64);
  peer.transport.CaptureFrame();
  peer.HookGraphics();
  peer.StartGraphics();
  auto capture = std::async(std::launch::async, [&] {
    try {
      peer.transport.CaptureFrame();
      return std::string();
    } catch (const std::exception& error) {
      return std::string(error.what());
    }
  });
  Expect(capture.wait_for(5s) == std::future_status::ready,
         "unfinished graphics frame blocked screenshot indefinitely");
  Expect(capture.get().find("graphics frame completion") != std::string::npos,
         "unfinished graphics frame returned old pixels instead of an error");
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

void TestInputRequestsFullRefresh() {
  for (const int action : {0, 1, 2, 3, 4, 5}) {
    RdpScreenshotTestPeer peer;
    peer.InformativePaint();
    peer.Paint(64);
    peer.transport.CaptureFrame();
    peer.EnableRefresh();
    switch (action) {
      case 0: peer.transport.MouseMove(8, 8); break;
      case 1: peer.transport.MouseButton("left", "click"); break;
      case 2: peer.transport.Wheel("down", 120, {}, {}); break;
      case 3: peer.transport.KeyPress("Control+A"); break;
      case 4: peer.transport.TypeText("a\n"); break;
      case 5: peer.transport.ClearInput(); break;
    }
    auto capture = std::async(std::launch::async,
                             [&] { return peer.transport.CaptureFrame(); });
    Expect(peer.WaitForRefresh(1), "input did not request a fresh remote framebuffer");
    Expect(peer.refresh_area.left == 0 && peer.refresh_area.top == 0 &&
               peer.refresh_area.right == 15 && peer.refresh_area.bottom == 15,
           "RefreshRect did not use inclusive desktop edges");
    const auto status = capture.wait_for(50ms);
    if (action == 0) {
      peer.HookGraphics();
      peer.StartGraphics();
    }
    peer.Paint(192);
    Expect(status == std::future_status::timeout,
           "screenshot returned the cached framebuffer before the refresh arrived");
    if (action == 0) {
      Expect(capture.wait_for(50ms) == std::future_status::timeout,
             "refresh coverage bypassed graphics-frame completion");
      peer.EndGraphics();
    }
    Expect(capture.wait_for(1s) == std::future_status::ready,
           "full refresh did not release the screenshot");
    Expect(HasColor(capture.get(), 192), "screenshot lost the refreshed pixels");
    auto next = std::async(std::launch::async,
                          [&] { return peer.transport.CaptureFrame(); });
    Expect(next.wait_for(1s) == std::future_status::ready,
           "screenshot without new input repeated the remote refresh");
    Expect(HasColor(next.get(), 192) && peer.refresh_requests == 1,
           "screenshot repeated a completed refresh");
  }
}

void TestRefreshRequiresExactCoverage() {
  RdpScreenshotTestPeer peer;
  peer.InformativePaint();
  peer.Paint(64);
  peer.transport.CaptureFrame();
  peer.EnableRefresh();
  peer.transport.MouseButton("left", "up");
  auto capture = std::async(std::launch::async,
                           [&] { return peer.transport.CaptureFrame(); });
  Expect(peer.WaitForRefresh(1), "refresh request was not sent");
  // Opposite corners span the desktop bounds, but do not cover the desktop.
  peer.PaintDisjointCorners(192);
  Expect(peer.WaitForRefresh(2), "disjoint coverage did not request missing regions");
  int requested[16][16]{};
  for (const auto& rect : peer.refresh_areas) {
    for (int y = rect.top; y <= rect.bottom; ++y) {
      for (int x = rect.left; x <= rect.right; ++x) {
        Expect(x < 16 && y < 16, "repair rectangle exceeded desktop bounds");
        ++requested[y][x];
      }
    }
  }
  for (int y = 0; y < 16; ++y) {
    for (int x = 0; x < 16; ++x) {
      const bool painted = (x == 0 && y == 0) || (x == 15 && y == 15);
      Expect(requested[y][x] == (painted ? 0 : 1),
             "repair duplicated pixels or included already painted corners");
    }
  }
  Expect(capture.wait_for(50ms) == std::future_status::timeout,
         "a bounding rectangle was mistaken for full desktop coverage");
  peer.end_paint_ok = false;
  peer.Paint(192);
  Expect(capture.wait_for(50ms) == std::future_status::timeout,
         "a failed paint was counted as full refresh coverage");
  peer.end_paint_ok = true;
  peer.PaintRegion(192, {0, 0, 16, 8});
  peer.PaintRegion(192, {0, 0, 16, 8});
  Expect(capture.wait_for(50ms) == std::future_status::timeout,
         "overlapping updates were counted more than once");
  peer.PaintRegion(192, {0, 8, 16, 16});
  Expect(capture.wait_for(1s) == std::future_status::ready,
         "multi-paint full coverage did not finish the refresh");
  Expect(HasColor(capture.get(), 192), "refresh returned partially updated pixels");
}

void TestRefreshIgnoresOlderGraphicsFrames() {
  RdpScreenshotTestPeer peer;
  peer.InformativePaint();
  peer.Paint(64);
  peer.transport.CaptureFrame();
  peer.EnableRefresh();
  peer.HookGraphics();
  peer.StartGraphics();
  peer.transport.MouseButton("left", "up");
  auto capture = std::async(std::launch::async,
                           [&] { return peer.transport.CaptureFrame(); });
  Expect(peer.WaitForRefresh(1), "refresh request was not sent");
  peer.decoded_color = 64;
  peer.EndGraphics();
  Expect(capture.wait_for(50ms) == std::future_status::timeout,
         "a frame decoding before the request was mistaken for its response");

  peer.StartGraphics();
  peer.PaintRegion(192, {0, 0, 16, 8});
  peer.transport.MarkGraphicsFrameCompleted();
  peer.StartGraphics();
  peer.PaintRegion(192, {0, 8, 16, 16});
  peer.transport.MarkGraphicsFrameCompleted();
  Expect(capture.wait_for(50ms) == std::future_status::timeout,
         "partial updates from different graphics frames completed the refresh");

  peer.StartGraphics();
  peer.decoded_color = 192;
  peer.EndGraphics();
  Expect(capture.wait_for(1s) == std::future_status::ready,
         "a new full graphics frame did not complete the refresh");
  Expect(HasColor(capture.get(), 192), "refresh returned an older graphics frame");
}

void TestClassicRefreshRepairsMissingStrip() {
  RdpScreenshotTestPeer peer;
  peer.InformativePaint();
  peer.Paint(64);
  peer.transport.CaptureFrame();
  peer.EnableRefresh();
  peer.transport.MouseMove(8, 8);
  auto capture = std::async(std::launch::async,
                           [&] { return peer.transport.CaptureFrame(); });
  Expect(peer.WaitForRefresh(1), "initial refresh request was not sent");
  peer.PaintRegion(192, {0, 2, 16, 16});
  Expect(peer.WaitForRefresh(2), "partial classic refresh did not request missing pixels");
  Expect(peer.refresh_area.left == 0 && peer.refresh_area.top == 0 &&
             peer.refresh_area.right == 15 && peer.refresh_area.bottom == 1,
         "repair request did not target the missing strip with inclusive edges");
  peer.PaintRegion(192, {0, 2, 16, 16});
  Expect(capture.wait_for(50ms) == std::future_status::timeout,
         "partial repair returned an incomplete framebuffer");
  Expect(peer.refresh_requests == 2, "partial paints caused an unbounded refresh loop");
  peer.PaintRegion(192, {0, 0, 16, 2});
  Expect(capture.wait_for(1s) == std::future_status::ready,
         "repaired coverage did not finish the screenshot");
  Expect(HasColor(capture.get(), 192), "repair returned old pixels in the missing strip");
}

void TestClassicRefreshRepairFailureCanRetry() {
  RdpScreenshotTestPeer peer;
  peer.InformativePaint();
  peer.Paint(64);
  peer.transport.CaptureFrame();
  peer.EnableRefresh();
  peer.transport.MouseMove(8, 8);
  auto capture = std::async(std::launch::async,
                           [&] { return peer.transport.CaptureFrame(); });
  Expect(peer.WaitForRefresh(1), "initial refresh request was not sent");
  peer.refresh_request_ok = false;
  peer.PaintRegion(192, {0, 2, 16, 16});
  Expect(peer.WaitForRefresh(2), "repair request was not attempted");
  bool failed = false;
  try {
    capture.get();
  } catch (const std::runtime_error& error) {
    failed = std::string(error.what()).find("missing RDP framebuffer regions") != std::string::npos;
  }
  Expect(failed, "failed repair returned cached pixels instead of an error");
  peer.refresh_request_ok = true;
  auto retry = std::async(std::launch::async,
                         [&] { return peer.transport.CaptureFrame(); });
  Expect(peer.WaitForRefresh(3), "failed repair could not be retried");
  peer.PaintRegion(192, {0, 0, 16, 2});
  Expect(retry.wait_for(1s) == std::future_status::ready,
         "successful repair retry did not complete");
  Expect(HasColor(retry.get(), 192), "repair retry returned old pixels");
}

void TestUnsupportedRefreshUsesLiveFramebuffer() {
  RdpScreenshotTestPeer peer;
  peer.InformativePaint();
  peer.Paint(64);
  peer.transport.CaptureFrame();
  peer.EnableRefresh(false);
  peer.transport.MouseMove(8, 8);
  peer.Paint(128);
  auto capture = std::async(std::launch::async,
                           [&] { return peer.transport.CaptureFrame(); });
  Expect(capture.wait_for(1s) == std::future_status::ready,
         "server without RefreshRect support stalled screenshot");
  Expect(HasColor(capture.get(), 128) && peer.refresh_requests == 0,
         "unsupported refresh was sent instead of reading the live framebuffer");
}

void TestRefreshFailureAndDisconnect() {
  RdpScreenshotTestPeer peer;
  peer.InformativePaint();
  peer.Paint(64);
  peer.transport.CaptureFrame();
  peer.EnableRefresh();
  peer.transport.MouseButton("left", "up");
  peer.refresh_request_ok = false;
  std::string failed;
  try { peer.transport.CaptureFrame(); }
  catch (const std::exception& error) { failed = error.what(); }
  Expect(failed.find("Failed to request") != std::string::npos,
         "refresh send failure returned cached pixels");
  peer.refresh_request_ok = true;
  auto capture = std::async(std::launch::async, [&] {
    try { peer.transport.CaptureFrame(); return std::string(); }
    catch (const std::exception& error) { return std::string(error.what()); }
  });
  Expect(peer.WaitForRefresh(2), "failed refresh request was not retried");
  peer.LoseSession();
  Expect(capture.wait_for(1s) == std::future_status::ready,
         "disconnect did not wake refresh waiting");
  Expect(capture.get().find("test disconnect") != std::string::npos,
         "refresh waiting lost the disconnect reason");
}

void TestRefreshReissuesAfterResize() {
  RdpScreenshotTestPeer peer;
  peer.InformativePaint();
  peer.Paint(64);
  peer.transport.CaptureFrame();
  peer.EnableRefresh();
  peer.transport.MouseMove(8, 8);
  auto capture = std::async(std::launch::async,
                           [&] { return peer.transport.CaptureFrame(); });
  Expect(peer.WaitForRefresh(1), "refresh request was not sent");
  peer.ResizeWidth(8);
  peer.PaintRegion(128, {0, 0, 8, 16});
  Expect(peer.WaitForRefresh(2), "desktop resize did not reissue the refresh");
  Expect(peer.refresh_area.right == 7 && peer.refresh_area.bottom == 15,
         "refresh still targeted the old desktop dimensions");
  peer.Paint(192);
  Expect(capture.wait_for(1s) == std::future_status::ready,
         "resized desktop refresh did not finish");
  const auto frame = capture.get();
  Expect(frame.size.width == 8 && HasColor(frame, 192),
         "resize returned an obsolete or partial snapshot");
}

void TestMissingRefreshTimesOut() {
  RdpScreenshotTestPeer peer;
  peer.InformativePaint();
  peer.Paint(64);
  peer.transport.CaptureFrame();
  peer.EnableRefresh();
  peer.transport.MouseMove(8, 8);
  auto capture = std::async(std::launch::async, [&] {
    try { peer.transport.CaptureFrame(); return std::string(); }
    catch (const std::exception& error) { return std::string(error.what()); }
  });
  Expect(peer.WaitForRefresh(1), "refresh request was not sent");
  Expect(capture.wait_for(5s) == std::future_status::ready,
         "missing refresh response blocked screenshot indefinitely");
  Expect(capture.get().find("framebuffer refresh") != std::string::npos,
         "missing refresh response returned cached pixels instead of an error");
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
  peer.transport.MarkGraphicsFrameStarted();
  peer.EnableRefresh();
  peer.transport.MouseMove(8, 8);
  peer.ResetConnection();
  peer.EnableRefresh();
  peer.InformativePaint();
  peer.Paint(128);
  auto capture = std::async(std::launch::async,
                           [&] { return peer.transport.CaptureFrame(); });
  Expect(capture.wait_for(50ms) == std::future_status::timeout,
         "new connection did not restore first-screenshot settling");
  Expect(HasColor(capture.get(), 128), "new connection returned old pixels");
  Expect(peer.refresh_requests == 0, "new connection kept the old input refresh flag");
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
    TestPngChecksumsAcrossBlockBoundaries();
    TestEndPaintPipeline();
    TestScreenshotWakeTimes();
    TestPartialFirstPaint();
    TestLaterScreenshotsDoNotWait();
    TestScreenshotWaitsForChannelPaint();
    TestSizeWaitsForChannelResize();
    TestScreenshotWaitsForDecodingFrame();
    TestFailedGraphicsFrameWakesOnDisconnect();
    TestUnfinishedGraphicsFrameTimesOut();
    TestContinuousUpdatesHaveDeadline();
    TestInputRequestsFullRefresh();
    TestRefreshRequiresExactCoverage();
    TestRefreshIgnoresOlderGraphicsFrames();
    TestClassicRefreshRepairsMissingStrip();
    TestClassicRefreshRepairFailureCanRetry();
    TestUnsupportedRefreshUsesLiveFramebuffer();
    TestRefreshFailureAndDisconnect();
    TestRefreshReissuesAfterResize();
    TestMissingRefreshTimesOut();
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
