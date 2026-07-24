#!/usr/bin/env python3

import gi

gi.require_version('Gtk', '3.0')
from gi.repository import Gtk


UI = '''
<interface>
  <requires lib="gtk+" version="3.20"/>
  <object class="GtkWindow" id="cache_fixture_window">
    <property name="title">Midscene Linux Cache Fixture</property>
    <property name="default-width">640</property>
    <property name="default-height">360</property>
    <property name="window-position">center</property>
    <child>
      <object class="GtkBox" id="cache_fixture_layout">
        <property name="orientation">vertical</property>
        <property name="halign">center</property>
        <property name="valign">center</property>
        <child>
          <object class="GtkButton" id="cache_target_button">
            <property name="label">Midscene Cache Target</property>
            <property name="width-request">260</property>
            <property name="height-request">72</property>
            <property name="can-focus">True</property>
          </object>
        </child>
      </object>
    </child>
  </object>
</interface>
'''


builder = Gtk.Builder.new_from_string(UI, -1)
window = builder.get_object('cache_fixture_window')
button = builder.get_object('cache_target_button')
button.get_accessible().set_name('Midscene Cache Target')
window.connect('destroy', Gtk.main_quit)
window.show_all()
window.present()
button.grab_focus()
Gtk.main()
