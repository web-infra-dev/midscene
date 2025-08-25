delay 4 -- you have 4 seconds to make iPhone Mirroring App foreground!!

tell application "System Events"
    set frontApp to name of first application process whose frontmost is true
    tell application process frontApp
        set win to first window
        set pos to position of win
        set size_ to size of win
        
        -- set margrin
        set leftMargin to 6
        set rightMargin to 6
        set topMargin to 38
        set bottomMargin to 6
        
        -- original
        set originalX to item 1 of pos
        set originalY to item 2 of pos
        set originalWidth to item 1 of size_
        set originalHeight to item 2 of size_
        
        -- clipped
        set contentX to originalX + leftMargin
        set contentY to originalY + topMargin
        set contentWidth to originalWidth - leftMargin - rightMargin
        set contentHeight to originalHeight - topMargin - bottomMargin
        
        return {frontApp, pos, size_, {contentX, contentY, contentWidth, contentHeight}}
    end tell
end tell