-- Extract notes from Apple Notes app
-- Returns JSON with all notes (title, modified, body snippet) and specifically the "Active" note

on run
	set noteList to {}
	set activeNoteContent to ""
	set noteIndex to 0

	tell application "Notes"
		set allNotes to notes of default account

		repeat with aNote in allNotes
			set noteTitle to name of aNote
			set noteDate to modification date of aNote
			set noteIndex to noteIndex + 1

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

			-- Escape title for JSON
			set safeTitle to do shell script "echo " & quoted form of noteTitle & " | sed 's/\\\\/\\\\\\\\/g' | sed 's/\"/\\\\\"/g'"

			-- Extract body snippet (first 15 notes only to keep agent fast)
			set safeBody to ""
			if noteIndex ≤ 15 then
				try
					set rawBody to body of aNote
					-- Truncate raw HTML before processing to limit shell time
					if length of rawBody > 2000 then
						set rawBody to text 1 thru 2000 of rawBody
					end if
					set safeBody to do shell script "printf '%s' " & quoted form of rawBody & " | sed 's/<[^>]*>//g' | sed 's/&amp;/\\&/g' | sed 's/&lt;/</g' | sed 's/&gt;/>/g' | sed 's/&nbsp;/ /g' | sed 's/\\\\/\\\\\\\\/g' | sed 's/\"/\\\\\"/g' | tr -d '\\r' | tr '\\n' ' '"
				on error
					set safeBody to ""
				end try
			end if

			set noteList to noteList & {"{\"title\":\"" & safeTitle & "\",\"modified\":\"" & dateStr & "\",\"body\":\"" & safeBody & "\"}"}
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
