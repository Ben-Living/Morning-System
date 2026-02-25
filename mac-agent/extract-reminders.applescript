-- Extract incomplete reminders from Apple Reminders app
-- Returns pipe-delimited text: one reminder per line, fields separated by |||
-- Fields: name|||list|||dueDate
-- JSON conversion is handled by agent.js

on run
	set output to ""

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

				set output to output & rName & "|||" & listName & "|||" & rDueDate & linefeed
			end repeat
		end repeat
	end tell

	return output
end run
