#include <iostream>
#include <string_view>

#include "rdp_helper_connection_policy.hpp"

namespace {

bool ExpectRetry(std::string_view name,
                 std::string_view protocol,
                 bool transport_failed,
                 bool using_rdp_security_layer,
                 bool expected) {
  const bool actual = midscene::rdp::ShouldRetryAutoWithRdp(
      protocol, transport_failed, using_rdp_security_layer);
  if (actual == expected) {
    return true;
  }

  std::cerr << name << ": expected retry=" << expected
            << ", actual=" << actual << '\n';
  return false;
}

}  // namespace

int main() {
  bool passed = true;
  passed &= ExpectRetry("auto RDP transport fallback", "auto", true, true,
                        true);
  passed &= ExpectRetry("explicit RDP", "rdp", true, true, false);
  passed &= ExpectRetry("auto authentication failure", "auto", false, true,
                        false);
  passed &= ExpectRetry("auto unreachable host", "auto", true, false, false);
  return passed ? 0 : 1;
}
