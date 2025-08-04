delay 4 -- you have 4 seconds to make iPhone Mirroring App foreground!!

tell application "System Events"
	set frontApp to name of first application process whose frontmost is true
	tell application process frontApp
		set win to first window
		set pos to position of win
		set size_ to size of win
		return {frontApp, pos, size_}
	end tell
end tell
