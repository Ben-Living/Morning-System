-- Extract incomplete reminders from Apple Reminders app
-- Returns pipe-delimited text: one reminder per line, fields separated by |||
-- Fields: name|||list
-- JSON conversion is handled by agent.js

on run
	set output to ""

	tell application "Reminders"
		set allLists to lists

		repeat with aList in allLists
			try
				set listName to name of aList
				set incompleteReminders to (reminders of aList whose completed is false)

				repeat with aReminder in incompleteReminders
					set rName to name of aReminder
					set output to output & rName & "|||" & listName & linefeed
				end repeat
			end try
		end repeat
	end tell

	return output
end run
