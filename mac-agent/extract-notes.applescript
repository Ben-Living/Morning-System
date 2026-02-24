-- Extract notes from Apple Notes app
-- Returns JSON with all notes and specifically the "Active" note

on run
	set noteList to {}
	set activeNoteContent to ""

	tell application "Notes"
		set allNotes to notes of default account

		repeat with aNote in allNotes
			set noteTitle to name of aNote
			set noteDate to modification date of aNote

			-- Check if this is the Active note
			if noteTitle is "Active" then
				try
					set rawBody to body of aNote
					-- Strip basic HTML tags
					set activeNoteContent to do shell script "echo " & quoted form of rawBody & " | sed 's/<[^>]*>//g' | sed 's/&amp;/\\&/g' | sed 's/&lt;/</g' | sed 's/&gt;/>/g' | sed 's/&nbsp;/ /g'"
				on error
					set activeNoteContent to "(could not read Active note)"
				end try
			end if

			-- Format date as ISO string
			set dateStr to (year of noteDate) & "-"

			set m to month of noteDate as integer
			if m < 10 then
				set dateStr to dateStr & "0" & m
			else
				set dateStr to dateStr & m
			end if

			set d to day of noteDate as integer
			if d < 10 then
				set dateStr to dateStr & "-0" & d
			else
				set dateStr to dateStr & "-" & d
			end if

			-- Escape for JSON
			set safeTitle to do shell script "echo " & quoted form of noteTitle & " | sed 's/\\\\/\\\\\\\\/g' | sed 's/\"/\\\\\"/g'"

			set noteList to noteList & {"{\"title\":\"" & safeTitle & "\",\"modified\":\"" & dateStr & "\"}"}
		end repeat
	end tell

	-- Build JSON array
	set notesJSON to "["
	set notesCount to count of noteList
	repeat with i from 1 to notesCount
		set notesJSON to notesJSON & item i of noteList
		if i < notesCount then
			set notesJSON to notesJSON & ","
		end if
	end repeat
	set notesJSON to notesJSON & "]"

	-- Escape active note for JSON
	if activeNoteContent is not "" then
		set safeActive to do shell script "echo " & quoted form of activeNoteContent & " | sed 's/\\\\/\\\\\\\\/g' | sed 's/\"/\\\\\"/g' | tr '\\n' '|'"
	else
		set safeActive to ""
	end if

	return "{\"notes\":" & notesJSON & ",\"active_note\":\"" & safeActive & "\"}"
end run
