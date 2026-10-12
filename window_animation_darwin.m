//go:build darwin && (production || dev)

#import <Cocoa/Cocoa.h>

// Wails v2 uses this NSWindow subclass for the application window.
@interface WailsWindow : NSWindow
@end

@implementation WailsWindow (RpcCallWindowAnimation)
- (NSTimeInterval)animationResizeTime:(NSRect)newFrame {
    // Native zoom animation exposes an old WebKit frame while the window grows.
    return 0;
}
@end

void rpccall_load_window_animation(void) {
    // Keep this object linked, including its category, in the Wails executable.
    [WailsWindow class];
}
