-- Extract incomplete reminders from Apple Reminders app
-- Returns JSON array of incomplete reminders

on run
	set reminderList to {}

	tell application "Reminders"
		set allLists to lists

		repeat with aList in allLists
			set listName to name of aList
			set incompleteReminders to (reminders of aList whose completed is false)

			repeat with aReminder in incompleteReminders
				set rName to name of aReminder
				set rDueDate to ""

				try
					set dueDateTime to due date of aReminder
					if dueDateTime is not missing value then
						set y to year of dueDateTime
						set m to month of dueDateTime as integer
						set d to day of dueDateTime as integer

						set dateStr to y & "-"
						if m < 10 then
							set dateStr to dateStr & "0" & m
						else
							set dateStr to dateStr & m
						end if
						if d < 10 then
							set dateStr to dateStr & "-0" & d
						else
							set dateStr to dateStr & "-" & d
						end if
						set rDueDate to dateStr as string
					end if
				end try

				-- Escape for JSON
				set safeName to do shell script "echo " & quoted form of rName & " | sed 's/\\\\/\\\\\\\\/g' | sed 's/\"/\\\\\"/g'"
				set safeList to do shell script "echo " & quoted form of listName & " | sed 's/\\\\/\\\\\\\\/g' | sed 's/\"/\\\\\"/g'"

				set reminderList to reminderList & {"{\"name\":\"" & safeName & "\",\"list\":\"" & safeList & "\",\"dueDate\":\"" & rDueDate & "\"}"}
			end repeat
		end repeat
	end tell

	-- Build JSON array
	set remindersJSON to "["
	set remindersCount to count of reminderList
	repeat with i from 1 to remindersCount
		set remindersJSON to remindersJSON & item i of reminderList
		if i < remindersCount then
			set remindersJSON to remindersJSON & ","
		end if
	end repeat
	set remindersJSON to remindersJSON & "]"

	return remindersJSON
end run
