#include <iostream>
#include <string>

#include "rdp_helper_json.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    const auto request = midscene::rdp::ParseRequestLine(line);
    const std::string request_id =
        request.has_value() ? request->id : midscene::rdp::ExtractRequestId(line);

    std::cout << midscene::rdp::MakeErrorResponse(
                     request_id,
                     "not_implemented",
                     "Cross-platform helper scaffold is present, but no concrete platform transport is wired yet.")
              << '\n';
    std::cout.flush();
  }

  return 0;
}
