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
    220,
    text="Midscene RDP integration test",
    fill="white",
    font=("DejaVu Sans", 32, "bold"),
)
entry_value = tk.StringVar()
entry = tk.Entry(
    root, textvariable=entry_value, font=("DejaVu Sans Mono", 24), width=36
)
canvas.create_window(WIDTH // 2, 340, window=entry)
entry.focus_force()


def show_black_framebuffer(*_):
    if entry_value.get().endswith("__MIDSCENE_BLACK__"):
        entry.destroy()
        canvas.delete("all")
        canvas.configure(background="black")


entry_value.trace_add("write", show_black_framebuffer)

root.mainloop()
