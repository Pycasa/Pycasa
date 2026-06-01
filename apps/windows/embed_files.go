package main

import (
	_ "embed"
)

//go:embed favicon.ico
var IconBytes []byte

//go:embed progress.html
var ProgressHTML string
