-- Extract notes from Apple Notes app
-- Returns JSON with all notes (title, modified, body snippet) and the full "Active" note

on run
	set noteList to {}
	set activeNoteContent to ""

	tell application "Notes"
		set allNotes to notes of default account

		repeat with aNote in allNotes
			set noteTitle to name of aNote
			set noteDate to modification date of aNote

			-- Extract body for every note (strip HTML, truncate to 600 chars)
			set safeBody to ""
			try
				set rawBody to body of aNote
				set safeBody to do shell script "printf '%s' " & quoted form of rawBody & " | python3 -c 'import sys,json,re; t=sys.stdin.read(); t=re.sub(\"<[^>]+>\",\"\",t); t=t.replace(\"&amp;\",\"&\").replace(\"&lt;\",\"<\").replace(\"&gt;\",\">\").replace(\"&nbsp;\",\" \"); t=re.sub(r\"\\s+\",\" \",t).strip()[:600]; print(json.dumps(t)[1:-1])'"
			on error
				set safeBody to ""
			end try

			-- Full body for Active note
			if noteTitle is "Active" then
				try
					set rawBody to body of aNote
					set activeNoteContent to do shell script "printf '%s' " & quoted form of rawBody & " | python3 -c 'import sys,json,re; t=sys.stdin.read(); t=re.sub(\"<[^>]+>\",\"\",t); t=t.replace(\"&amp;\",\"&\").replace(\"&lt;\",\"<\").replace(\"&gt;\",\">\").replace(\"&nbsp;\",\" \"); t=re.sub(r\"\\s+\",\" \",t).strip()[:3000]; print(json.dumps(t)[1:-1])'"
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

			-- Escape title for JSON using Python
			set safeTitle to do shell script "printf '%s' " & quoted form of noteTitle & " | python3 -c 'import sys,json; t=sys.stdin.read().strip()[:200]; print(json.dumps(t)[1:-1])'"

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

	-- Escape active note for JSON using Python
	set safeActive to ""
	if activeNoteContent is not "" then
		set safeActive to activeNoteContent
	end if

	return "{\"notes\":" & notesJSON & ",\"active_note\":\"" & safeActive & "\"}"
end run
