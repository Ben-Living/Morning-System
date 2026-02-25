-- Extract incomplete reminders from Apple Reminders app
-- Returns a JSON array: [{name, list}]
-- JSON is built in AppleScript so reminder names are properly escaped
-- and cannot break the delimiter-based parsing that the old text format used.

on run
	set reminderList to {}

	tell application "Reminders"
		set allLists to lists

		repeat with aList in allLists
			try
				set listName to name of aList
				set safeList to do shell script "printf '%s' " & quoted form of listName & " | sed 's/\\\\/\\\\\\\\/g' | sed 's/\"/\\\\\"/g' | tr -d '\\r' | tr '\\n' ' '"

				set incompleteReminders to (reminders of aList whose completed is false)

				repeat with aReminder in incompleteReminders
					set rName to name of aReminder
					set safeName to do shell script "printf '%s' " & quoted form of rName & " | sed 's/\\\\/\\\\\\\\/g' | sed 's/\"/\\\\\"/g' | tr -d '\\r' | tr '\\n' ' '"
					set reminderList to reminderList & {"{\"name\":\"" & safeName & "\",\"list\":\"" & safeList & "\"}"}
				end repeat
			end try
		end repeat
	end tell

	-- Build JSON array
	set jsonOutput to "["
	set reminderCount to count of reminderList
	repeat with i from 1 to reminderCount
		set jsonOutput to jsonOutput & item i of reminderList
		if i < reminderCount then
			set jsonOutput to jsonOutput & ","
		end if
	end repeat
	set jsonOutput to jsonOutput & "]"

	return jsonOutput
end run
