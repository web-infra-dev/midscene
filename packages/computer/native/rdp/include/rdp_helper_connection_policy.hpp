#pragma once

#include <string_view>

namespace midscene::rdp {

constexpr bool ShouldRetryAutoWithRdp(std::string_view security_protocol,
                                      bool transport_failed,
                                      bool using_rdp_security_layer) noexcept {
  return security_protocol == "auto" && transport_failed &&
         using_rdp_security_layer;
}

}  // namespace midscene::rdp
