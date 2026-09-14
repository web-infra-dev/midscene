#!/usr/bin/env python3

import tkinter as tk


WIDTH = 1280
HEIGHT = 720


root = tk.Tk()
root.title("Midscene RDP CI")
root.geometry(f"{WIDTH}x{HEIGHT}+0+0")
root.configure(background="#123456")

canvas = tk.Canvas(root, width=WIDTH, height=HEIGHT, highlightthickness=0)
canvas.pack(fill="both", expand=True)
for y in range(HEIGHT):
    ratio = y / (HEIGHT - 1)
    red = round(0x12 + (0xAB - 0x12) * ratio)
    green = round(0x34 + (0xCD - 0x34) * ratio)
    blue = round(0x56 + (0xEF - 0x56) * ratio)
    canvas.create_line(0, y, WIDTH, y, fill=f"#{red:02x}{green:02x}{blue:02x}")

canvas.create_text(
    WIDTH // 2,
    80,
    text="Midscene RDP integration test",
    fill="white",
    font=("DejaVu Sans", 32, "bold"),
)
entry = tk.Entry(root, font=("DejaVu Sans Mono", 24), width=36)
canvas.create_window(WIDTH // 2, 165, window=entry)
entry.focus_force()

status_value = tk.StringVar(value="Ready for RDP input")
status = tk.Label(
    root,
    textvariable=status_value,
    font=("DejaVu Sans", 18, "bold"),
    background="#f4e04d",
    width=34,
)
canvas.create_window(WIDTH // 2, 235, window=status)


def set_status(value):
    status_value.set(value)


entry.bind("<Return>", lambda _event: set_status("KeyboardPress: Enter"))


def action_target(text, x, y, background):
    target = tk.Label(
        root,
        text=text,
        font=("DejaVu Sans", 16, "bold"),
        background=background,
        width=16,
        height=2,
    )
    canvas.create_window(x, y, window=target)
    return target


hover_target = action_target("Hover", 180, 340, "#65d46e")
hover_target.bind("<Enter>", lambda _event: set_status("Hover received"))

double_click_target = action_target("Double click", 460, 340, "#ff9f43")
double_click_target.bind(
    "<Double-Button-1>", lambda _event: set_status("DoubleClick received")
)

right_click_target = action_target("Right click", 740, 340, "#b388ff")
right_click_target.bind(
    "<Button-3>", lambda _event: set_status("RightClick received")
)

drag_source = action_target("Drag source", 1020, 320, "#4dd0e1")
drop_target = action_target("Drop target", 1020, 440, "#ef5350")


def finish_drag(event):
    pointer_x = drag_source.winfo_rootx() + event.x
    pointer_y = drag_source.winfo_rooty() + event.y
    if (
        drop_target.winfo_rootx()
        <= pointer_x
        <= drop_target.winfo_rootx() + drop_target.winfo_width()
        and drop_target.winfo_rooty()
        <= pointer_y
        <= drop_target.winfo_rooty() + drop_target.winfo_height()
    ):
        set_status("DragAndDrop received")


drag_source.bind("<ButtonRelease-1>", finish_drag)

scroll_target = action_target("Scroll here", 460, 475, "#42a5f5")
for scroll_event in ("<Button-4>", "<Button-5>", "<MouseWheel>"):
    scroll_target.bind(scroll_event, lambda _event: set_status("Scroll received"))


def show_black_framebuffer():
    for widget in interactive_widgets:
        widget.destroy()
    canvas.delete("all")
    canvas.configure(background="black")


black_button = tk.Button(
    root,
    text="Show valid black framebuffer",
    command=show_black_framebuffer,
    font=("DejaVu Sans", 18),
)
canvas.create_window(WIDTH // 2, 625, window=black_button)

interactive_widgets = [
    entry,
    status,
    hover_target,
    double_click_target,
    right_click_target,
    drag_source,
    drop_target,
    scroll_target,
    black_button,
]

root.mainloop()
