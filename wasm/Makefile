# create directories if they do not exist

BUILD_DIR = ./
OUTPUT_DIR = ./
SRC_DIR = ./

# the compiler: gcc for C program, define as g++ for C++
CC = g++

# compiler flags:
CFLAGS := -O3 -Wall

# debug flags
DEBUGFLAGS := -g -march=native

# linker flags:
LDFLAGS = -lm

# objects
OBJS = $(shell find $(SRC_DIR) -name *.cpp)

# target
TARGET = countCrossings

asm:
	g++ $(OBJS) -o $(BUILD_DIR)/$(TARGET) $(CFLAGS) $(LDFLAGS)

wasm:
	em++ $(OBJS) -o $(BUILD_DIR)/$(TARGET).js $(CFLAGS) $(LDFLAGS) -DWASM -s EXPORTED_FUNCTIONS='["_reorder"]' -s INITIAL_MEMORY=1073741824

