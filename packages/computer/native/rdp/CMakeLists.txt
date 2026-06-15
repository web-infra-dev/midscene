cmake_minimum_required(VERSION 3.20)

project(midscene_rdp_helper LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(RDP_HELPER_OUTPUT_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../bin/${CMAKE_SYSTEM_NAME}" CACHE PATH "Output directory for the built RDP helper")
set(RDP_HELPER_OUTPUT_NAME "rdp-helper" CACHE STRING "Output name for the built RDP helper")

find_package(Threads REQUIRED)

if(WIN32)
  find_path(FREERDP_INCLUDE_DIR NAMES freerdp/freerdp.h)
  find_path(WINPR_INCLUDE_DIR NAMES winpr/wlog.h)
  find_library(FREERDP_LIBRARY NAMES freerdp3 freerdp)
  find_library(FREERDP_CLIENT_LIBRARY NAMES freerdp-client3 freerdp-client)
  find_library(WINPR_LIBRARY NAMES winpr3 winpr)

  if(NOT FREERDP_INCLUDE_DIR OR NOT WINPR_INCLUDE_DIR OR NOT FREERDP_LIBRARY OR NOT FREERDP_CLIENT_LIBRARY OR NOT WINPR_LIBRARY)
    message(FATAL_ERROR "FreeRDP headers and libraries are required. Set FREERDP_INCLUDE_DIR, WINPR_INCLUDE_DIR, FREERDP_LIBRARY, FREERDP_CLIENT_LIBRARY, and WINPR_LIBRARY if CMake cannot find them automatically.")
  endif()

  set(FREERDP_INCLUDE_DIRS ${FREERDP_INCLUDE_DIR} ${WINPR_INCLUDE_DIR})
  set(FREERDP_LIBRARIES ${FREERDP_CLIENT_LIBRARY} ${FREERDP_LIBRARY} ${WINPR_LIBRARY})
else()
  find_package(PkgConfig REQUIRED)
  # winpr3 is listed in Requires.private of freerdp3.pc, so on linux with
  # the default --as-needed linker behavior pkg-config won't emit -lwinpr3
  # unless we ask for it explicitly. session.cpp directly references WinPR
  # symbols (e.g. WaitForMultipleObjects), so request it as a public dep.
  pkg_check_modules(FREERDP REQUIRED IMPORTED_TARGET freerdp3 freerdp-client3 winpr3)
  set(FREERDP_INCLUDE_DIRS "")
  set(FREERDP_LIBRARIES PkgConfig::FREERDP)
endif()

add_executable(
  rdp-helper
  src/json.cpp
  src/main.cpp
  src/png.cpp
  src/protocol.cpp
  src/session.cpp
)

target_include_directories(
  rdp-helper
  PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/include
  ${FREERDP_INCLUDE_DIRS}
)

target_link_libraries(
  rdp-helper
  PRIVATE
  ${FREERDP_LIBRARIES}
  Threads::Threads
)

add_executable(
  rdp-helper-png-test
  tests/png_test.cpp
  src/png.cpp
)

target_include_directories(
  rdp-helper-png-test
  PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/include
  ${FREERDP_INCLUDE_DIRS}
)

target_link_libraries(
  rdp-helper-png-test
  PRIVATE
  ${FREERDP_LIBRARIES}
  Threads::Threads
)

add_custom_command(
  TARGET rdp-helper-png-test
  POST_BUILD
  COMMAND $<TARGET_FILE:rdp-helper-png-test>
)

if(APPLE)
  target_compile_definitions(rdp-helper PRIVATE _DARWIN_C_SOURCE)
endif()

set_target_properties(
  rdp-helper
  PROPERTIES
  OUTPUT_NAME ${RDP_HELPER_OUTPUT_NAME}
  RUNTIME_OUTPUT_DIRECTORY ${RDP_HELPER_OUTPUT_DIR}
)
