#pragma once

#include <cstdint>
#include <string>
#include <string_view>

namespace midscene::rdp {

constexpr bool ShouldReportEventLoopFailure(bool operation_failed,
                                            bool disconnect_requested,
                                            bool session_running,
                                            bool session_connected) noexcept {
  return (operation_failed || disconnect_requested) && session_running &&
         session_connected;
}

inline std::string BuildFirstFrameTimeoutMessage(
    uint64_t framebuffer_updates,
    std::string_view failure_reason) {
  std::string message;
  if (framebuffer_updates == 0) {
    message =
        "Connected to the RDP server but received no desktop frame within "
        "timeout; the remote desktop may be blank or locked";
  } else {
    message = "Connected to the RDP server and received " +
              std::to_string(framebuffer_updates) + " framebuffer update";
    if (framebuffer_updates != 1) {
      message += "s";
    }
    message +=
        ", but none passed the informative-frame check within timeout; the "
        "remote desktop may be blank, locked, or still loading";
  }
  if (!failure_reason.empty()) {
    message += " (" + std::string(failure_reason) + ")";
  }
  return message;
}

}  // namespace midscene::rdp
