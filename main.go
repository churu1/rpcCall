package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"rpccall/internal/logger"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	if err := logger.Init(); err != nil {
		println("Warning: failed to init logger:", err.Error())
	}
	defer logger.Close()

	app := NewApp()

	err := wails.Run(&options.App{
		Title:     "RpcCall",
		Width:     1280,
		Height:    800,
		MinWidth:  900,
		MinHeight: 600,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 15, G: 17, B: 23, A: 255},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
		Mac: &mac.Options{
			TitleBar: &mac.TitleBar{
				TitlebarAppearsTransparent: true,
				HideTitle:                 true,
				HideTitleBar:              false,
				FullSizeContent:           true,
			},
			WebviewIsTransparent: true,
			WindowIsTranslucent:  false,
		},
		Frameless: false,
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
