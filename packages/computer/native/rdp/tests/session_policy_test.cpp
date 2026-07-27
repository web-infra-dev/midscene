#include <iostream>
#include <string>
#include <string_view>

#include "rdp_helper_session_policy.hpp"

namespace {

bool ExpectBool(std::string_view name, bool actual, bool expected) {
  if (actual == expected) {
    return true;
  }

  std::cerr << name << ": expected " << expected << ", actual=" << actual
            << '\n';
  return false;
}

bool ExpectMessage(std::string_view name,
                   const std::string& actual,
                   std::string_view expected) {
  if (actual == expected) {
    return true;
  }

  std::cerr << name << ": expected \"" << expected << "\", actual=\""
            << actual << "\"\n";
  return false;
}

}  // namespace

int main() {
  bool passed = true;
  passed &= ExpectBool(
      "active transport failure",
      midscene::rdp::ShouldReportEventLoopFailure(true, false, true, true),
      true);
  passed &= ExpectBool(
      "intentional shutdown transport failure",
      midscene::rdp::ShouldReportEventLoopFailure(true, false, false, false),
      false);
  passed &= ExpectBool(
      "active server disconnect",
      midscene::rdp::ShouldReportEventLoopFailure(false, true, true, true),
      true);
  passed &= ExpectBool(
      "healthy active session",
      midscene::rdp::ShouldReportEventLoopFailure(false, false, true, true),
      false);

  passed &= ExpectMessage(
      "no framebuffer updates",
      midscene::rdp::BuildFirstFrameTimeoutMessage(0, ""),
      "Connected to the RDP server but received no desktop frame within "
      "timeout; the remote desktop may be blank or locked");
  passed &= ExpectMessage(
      "non-informative framebuffer updates",
      midscene::rdp::BuildFirstFrameTimeoutMessage(3, ""),
      "Connected to the RDP server and received 3 framebuffer updates, but "
      "none passed the informative-frame check within timeout; the remote "
      "desktop may be blank, locked, or still loading");
  passed &= ExpectMessage(
      "single non-informative framebuffer update",
      midscene::rdp::BuildFirstFrameTimeoutMessage(1, ""),
      "Connected to the RDP server and received 1 framebuffer update, but "
      "none passed the informative-frame check within timeout; the remote "
      "desktop may be blank, locked, or still loading");
  passed &= ExpectMessage(
      "session loss reason",
      midscene::rdp::BuildFirstFrameTimeoutMessage(
          0, "ERRCONNECT_CONNECT_TRANSPORT_FAILED"),
      "Connected to the RDP server but received no desktop frame within "
      "timeout; the remote desktop may be blank or locked "
      "(ERRCONNECT_CONNECT_TRANSPORT_FAILED)");
  return passed ? 0 : 1;
}
