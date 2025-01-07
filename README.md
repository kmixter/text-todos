# VSCode Text-based TODOs

This is an extension that enables tracking todos in text files (vs source files). The
format of the TODOs is specific and enables tracking tasks, due dates, how much time
to spend on them each day, and marking when they are done week to week.

## Format

Generally the format of text files is:

```
TODOs:
* Renew your license 10m <=5/15
* Pick up groceries 2h <=5/11
* Clean up documentation 30m <=5/11
M Make bed
```

Where a TODO region starts with TODOs and has followers of the format:
* Asterisk for a task not yet done (e.g. * Not yet done)
* Letter for day of the week (Monday, Tuesday, Wednesday, thuRsday, Friday, Saturday, suNday) (e.g. M This was done on Monday)
* Optional estimated total time expected (not remaining, total with m or h for hours or minutes) (e.g. * This will take an hour 1hr)
* Optional due date starting with <= followed by MM/DD format (assumes next year month if month earlier) (e.g. * This is due first of April <=4/1)
* Optional time spent to date prefixed with a plus (e.g. * I have spent 55 minutes on this. +55m)

## Shortcuts

The following keyboard shortcuts are registered:
* Ctrl+K M - mark the current TODO follower line as complete given today's day of week.
* Ctrl+K A - archive the previous block of TODOs (earlier in this file) as done,
  and insert a new block at current cursor. Useful for a journal text file that grows down.
* Ctrl+K S - sorts the TODOs region so that it shows pending tasks at the top, and completed
  tasks by day afterwards. The overall remaining completion rate is shown as a comment on the
  TODOs: line.
* Ctrl+K H - highlights (selects) the TODOs region.
* Ctrl+K T - inserts a new date header
