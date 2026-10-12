//go:build darwin && (production || dev)

package main

/*
#cgo LDFLAGS: -framework Cocoa
void rpccall_load_window_animation(void);
*/
import "C"

func init() {
	C.rpccall_load_window_animation()
}
