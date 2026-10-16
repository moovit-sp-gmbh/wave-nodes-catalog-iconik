::wavedoc
---
title: Get Original Download URL
description: |
  The Get Original Download URL node returns a download URL for the original file of an Iconik asset, for example to hand it to a transcoder or QC tool in the next node. The URL is a temporary signed URL that Iconik creates for this request: it expires, so pass it directly to the next node and do not store it for later. Anyone who has the URL can download the file until it expires. The node does not download the file itself and changes nothing in Iconik. It makes three requests: it reads the asset's ORIGINAL format, lists the asset's files to find those of that format, and asks Iconik for the download URL of the first complete (CLOSED) one. When the original format holds several files, for example an image sequence, the URL is for the first file and all files are returned in the Files output. It fails with "Asset has no original file" for an asset without one, such as a placeholder, and with a clear message when the original is archived, offline or not complete yet. When Iconik answers 404 for the format or the files listing, the node checks whether the asset exists, so an unknown Asset ID is reported as such instead of as a missing original. The node authenticates with an Iconik App ID and Auth Token; wire both from Get Secret nodes. Iconik requires the can_read_formats and can_read_files roles for these requests, and can_read_assets for the check after a 404. When Iconik rate-limits a request (429), the node tries it again, up to 3 attempts in total.
inputs:
  - name: App ID
    description: |
      Enter the app ID for the Iconik API. Leading and trailing spaces are removed. Replaced by a placeholder in the Curl output
    type: STRING_PASSWORD
    mandatory: true
    example:
      - name: App ID
        value: "example-app-id"
  - name: Auth Token
    description: |
      Enter the auth token for the Iconik API that belongs to the App ID. Leading and trailing spaces are removed. Replaced by a placeholder in the Curl output and in error messages
    type: STRING_PASSWORD
    mandatory: true
    example:
      - name: Auth Token
        value: "example-auth-token"
  - name: Asset ID
    description: |
      Enter the ID of the asset, for example from the payload of an Iconik webhook or from Get Asset or Search. It must be a UUID (36 characters with hyphens, upper or lower case); leading and trailing spaces are removed
    type: STRING
    mandatory: true
    example:
      - name: Asset ID
        value: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"
  - name: Iconik URL
    description: |
      Enter the base URL of the Iconik instance, starting with http:// or https://. Leave it empty to use https://app.iconik.io, the default. Trailing slashes are removed
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Iconik URL
        value: "https://app.iconik.io"
outputs:
  - name: Download URL
    description: |
      Returns the temporary signed URL of the original file, as Iconik returns it. It expires, so wire it directly into the next node; anyone with the URL can download the file until then. Stays empty when the node fails
    type: STRING
    example:
      - name: Download URL
        value: "https://storage.example.com/originals/Summer_Campaign_Final.mov?signature=abc123&expires=1760000000"
  - name: File ID
    description: |
      Returns the ID of the file the URL points to: the first file of the original format with status CLOSED. Stays empty when the node fails
    type: STRING
    example:
      - name: File ID
        value: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e"
  - name: File name
    description: |
      Returns the name of that file as Iconik stores it, or its original name when Iconik has no name. Stays empty when the node fails
    type: STRING
    example:
      - name: File name
        value: "Summer_Campaign_Final.mov"
  - name: File size
    description: |
      Returns the size of that file in bytes, or 0 when Iconik reports no size. Stays empty when the node fails
    type: NUMBER
    example:
      - name: File size
        value: 1073741824
  - name: Format ID
    description: |
      Returns the ID of the asset's ORIGINAL format. Stays empty when the node fails
    type: STRING
    example:
      - name: Format ID
        value: "8c7b6a5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d"
  - name: Files
    description: |
      Returns all files of the original format, unchanged, as a JSON list, whatever their status; for an image sequence, every frame. Each has fields such as id, name, size, status and format_id. Stays empty when the node fails
    type: JSON
    example:
      - name: Files
        value: |
          [
            {
              "id": "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
              "name": "Summer_Campaign_Final.mov",
              "size": 1073741824,
              "status": "CLOSED",
              "format_id": "8c7b6a5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d"
            }
          ]
  - name: Curl
    description: |
      Returns the last request sent as a curl command, with placeholders in place of the App ID and Auth Token: the download URL request when the node succeeds, otherwise the request that failed. It stays empty when an input check fails first
    type: STRING
    example:
      - name: Curl
        value: |
          curl -X GET \
            -H "App-ID: <your-app-id>" \
            -H "Auth-Token: <your-auth-token>" \
            -H "Content-Type: application/json" \
            -H "Accept: application/json" \
            -L --max-redirs 5 \
            "https://app.iconik.io/API/files/v1/assets/7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b/files/2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e/download_url/"
connectors:
  - name: Success
    description: |
      Triggered when Iconik returned a download URL for a complete file of the asset's original format
  - name: Fail
    description: |
      Triggered when an input check fails, the asset has no usable original file, or Iconik rejects a request. When an input check fails, nothing is sent to Iconik. Every error Iconik reports is shown as "Iconik returned <status>: <Iconik's error text>"
    causes:
      - name: Invalid Input
        description: |
          If Asset ID is not a UUID
      - name: No Original File
        description: |
          If the asset has no ORIGINAL format, or the format holds no file, as for a placeholder asset. The message starts with "Asset has no original file"
      - name: Archived
        description: |
          If Iconik reports the original format as ARCHIVED or ARCHIVING, or its files as ARCHIVED. Restore the original in Iconik first
      - name: Offline
        description: |
          If the original's files are MISSING or Iconik reports the format as not online. Check the storage the file is on
      - name: Not Complete
        description: |
          If no file of the original format has status CLOSED yet, for example while an upload is still running
      - name: Asset Not Found
        description: |
          If Iconik has no asset with this Asset ID
      - name: Too Many Files
        description: |
          If the asset has more than 10,000 files; the node fails rather than look at only some of them
      - name: No URL
        description: |
          If Iconik returns the chosen original file without an ID, or answers the download URL request without a URL
      - name: Authentication Failed
        description: |
          If the App ID or Auth Token is empty, or Iconik answers 401 or 403
      - name: Not Found
        description: |
          If Iconik answers 404 for the download URL request, which it documents for a file that does not exist. The message names the Asset ID
      - name: Rate Limited
        description: |
          If Iconik still answers 429 on the third attempt of a request. Between attempts the node waits as long as Iconik's Retry-After header says, at most 60 seconds, or 1 second and then 2 seconds when the header is missing
      - name: Connection Error
        description: |
          If the Iconik URL is not a valid http:// or https:// URL, Iconik cannot be reached, or Iconik does not answer within 30 seconds
      - name: Canceled
        description: |
          If the stream is canceled while the node waits to retry a rate-limited request
      - name: API Error
        description: |
          If Iconik answers with any other non-2xx status, including 400
---
::
