cmake_minimum_required(VERSION 3.20)

project(midscene_rdp_helper_scaffold LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(
  rdp-helper-core-scaffold
  STATIC
  src/json.cpp
  src/png.cpp
  src/protocol.cpp
  src/session.cpp
)

target_include_directories(
  rdp-helper-core-scaffold
  PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

add_executable(
  rdp-helper-scaffold
  src/main.cpp
)

target_link_libraries(
  rdp-helper-scaffold
  PRIVATE
  rdp-helper-core-scaffold
)
