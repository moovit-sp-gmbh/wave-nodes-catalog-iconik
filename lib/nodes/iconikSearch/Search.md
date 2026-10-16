::wavedoc
---
title: Search
description: |
  The Search node searches Iconik for assets, collections or both, by search text, by an Iconik search filter, or by both. Both are optional; with neither set, the search matches every object of the chosen Object Types. By default it returns one page of results; with Fetch All enabled it pages through all results, up to 10,000 objects, and sets a warning when there are more. The node changes nothing in Iconik. It ends on Success when Iconik answers, also when nothing matches; Total count is then 0 and Object IDs an empty list.

  A filter uses Iconik's search format: an operator (AND, OR, NOT or NESTED) and a list of terms, each with a field name and a value, a list of values (value_in), a range (min and max) or exists/missing. For example, active assets created since 1 January 2026:

  {"operator": "AND", "terms": [{"name": "status", "value": "ACTIVE"}, {"name": "date_created", "range": {"min": "2026-01-01T00:00:00Z"}}]}

  The full format is in Iconik's search API spec at https://app.iconik.io/docs/search/spec/ (SearchCriteriaSchema). Wire Object IDs into Get Asset, Get Metadata, Delete Asset or Add to Collection. The node authenticates with an Iconik App ID and Auth Token; wire both from Get Secret nodes. Iconik requires the can_search role for this request. When Iconik rate-limits a request (429), the node tries it again, up to 3 attempts in total.
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
  - name: Search Query
    description: |
      Enter the text to search for, as in Iconik's search bar. Leading and trailing spaces are removed. Leave it empty to search by Search Filter only, or leave both empty to match every object of the chosen Object Types
    type: STRING
    mandatory: false
    example:
      - name: Search Query
        value: "summer campaign"
  - name: Object Types
    description: |
      Choose what to search. Assets is the default
    type: STRING_SELECT
    mandatory: false
    options:
      - name: Assets
        description: |
          Searches assets only
        default: true
      - name: Collections
        description: |
          Searches collections only
      - name: Assets and Collections
        description: |
          Searches both; each result's object_type says which it is
    example:
      - name: Object Types
        value: "Assets"
  - name: Search Filter
    description: |
      Enter an Iconik search filter as a JSON object; it is sent to Iconik unchanged, so Iconik checks its fields. Leave it empty to search by Search Query only. When both are set, results must match both. A value that is not valid JSON, or is not a JSON object, fails the node before a request is sent. See the node description for an example
    type: STRING_LONG
    mandatory: false
    advanced: true
    example:
      - name: Search Filter
        value: |
          {
            "operator": "AND",
            "terms": [
              { "name": "status", "value": "ACTIVE" },
              { "name": "date_created", "range": { "min": "2026-01-01T00:00:00Z" } }
            ]
          }
  - name: Sort Order
    description: |
      Enter the sort order as a JSON array of objects, each with a field name and an order of asc or desc; it is sent to Iconik unchanged. Leave it empty to use Iconik's default order. A value that is not a JSON array fails the node before a request is sent
    type: STRING_LONG
    mandatory: false
    advanced: true
    example:
      - name: Sort Order
        value: |
          [
            { "name": "date_created", "order": "desc" }
          ]
  - name: Results per Page
    description: |
      Enter how many results Iconik returns per page, a whole number from 1 to 500. Leave it empty to get 50, the default. With Fetch All enabled it sets the size of each page fetched
    type: NUMBER
    mandatory: false
    advanced: true
    example:
      - name: Results per Page
        value: 50
  - name: Page
    description: |
      Enter the number of the page to return, a whole number starting at 1. Leave it empty to get page 1, the default. Ignored when Fetch All is enabled. A page past the last one makes Iconik answer 404
    type: NUMBER
    mandatory: false
    advanced: true
    example:
      - name: Page
        value: 1
  - name: Fetch All
    description: |
      Enable to fetch every page, starting at page 1, and return all results together, up to 10,000 objects; Page is then ignored. When more results exist, the first 10,000 are returned and Warning says so. Disabled by default
    type: BOOLEAN
    mandatory: false
    advanced: true
    example:
      - name: Fetch All
        value: false
  - name: Iconik URL
    description: |
      Enter the base URL of the Iconik instance, starting with http:// or https://. Leave it empty to use https://app.iconik.io, the default. Trailing slashes are removed
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Iconik URL
        value: "https://app.iconik.io"
  - name: Generate Signed URLs
    description: |
      Enable to send Iconik generate_signed_url=true, which asks Iconik to include signed URLs, such as keyframe links, in the results. Enabled by default, as in Iconik
    type: BOOLEAN
    mandatory: false
    advanced: true
    example:
      - name: Generate Signed URLs
        value: true
outputs:
  - name: Object IDs
    description: |
      Returns the IDs of the objects in Objects, in the order Iconik returned them. An empty list when nothing matches. Stays empty when the node fails
    type: STRING_LIST
    example:
      - name: Object IDs
        value: '["7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"]'
  - name: Total count
    description: |
      Returns how many objects match the search in Iconik, as Iconik reports it. This can be larger than the number of Object IDs, which only covers the page or pages returned. Stays empty when the node fails
    type: NUMBER
    example:
      - name: Total count
        value: 1
  - name: Page
    description: |
      Returns the number of the page returned; with Fetch All enabled, the number of the last page fetched. Stays empty when the node fails
    type: NUMBER
    example:
      - name: Page
        value: 1
  - name: Pages
    description: |
      Returns how many pages the search has in Iconik at the current Results per Page. Stays empty when the node fails
    type: NUMBER
    example:
      - name: Pages
        value: 1
  - name: Warning
    description: |
      Returns a warning when Fetch All stopped at 10,000 objects while Iconik had more, with Iconik's total. Empty text otherwise. Stays empty when the node fails
    type: STRING
    example:
      - name: Warning
        value: "Fetch All stopped at 10000 objects; Iconik reports 12500 matches. Narrow the search to get the rest."
  - name: Objects
    description: |
      Returns the objects found, unchanged, as a JSON list; with Fetch All enabled, the objects of all pages fetched. Each has fields such as id, title and object_type. Stays empty when the node fails
    type: JSON
    example:
      - name: Objects
        value: |
          [
            { "id": "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b", "title": "Summer_Campaign_Final.mov", "object_type": "assets" }
          ]
  - name: Search result
    description: |
      Returns Iconik's response unchanged, with objects, page, pages, per_page and total; with Fetch All enabled, the response for the last page fetched only. Stays empty when the node fails
    type: JSON
    example:
      - name: Search result
        value: |
          {
            "objects": [{ "id": "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b", "title": "Summer_Campaign_Final.mov", "object_type": "assets" }],
            "page": 1,
            "pages": 1,
            "per_page": 50,
            "total": 1
          }
  - name: Curl
    description: |
      Returns the first request as a curl command, with placeholders in place of the App ID and Auth Token; with Fetch All enabled, later pages differ only in the page number. It is set before the request is sent, so it also holds a value when Iconik rejects the request; it stays empty when an input check fails first
    type: STRING
    example:
      - name: Curl
        value: |
          curl -X POST \
            -H "App-ID: <your-app-id>" \
            -H "Auth-Token: <your-auth-token>" \
            -H "Content-Type: application/json" \
            -H "Accept: application/json" \
            -d '{"doc_types":["assets"],"query":"summer campaign"}' \
            -L --max-redirs 5 \
            "https://app.iconik.io/API/search/v1/search/?page=1&per_page=50&generate_signed_url=true"
connectors:
  - name: Success
    description: |
      Triggered when Iconik answers every request with a 2xx status, including when nothing matches and when Fetch All stopped at 10,000 objects
  - name: Fail
    description: |
      Triggered when an input check fails or Iconik rejects a request. When an input check fails, nothing is sent to Iconik. With Fetch All enabled, a failure on any page fails the node and no results are returned. Every error Iconik reports is shown as "Iconik returned <status>: <Iconik's error text>"
    causes:
      - name: Invalid Input
        description: |
          If Search Filter is not valid JSON or not a JSON object, Sort Order is not a JSON array, Object Types is not one of its options, Results per Page is not a whole number from 1 to 500, or Page is not a whole number of at least 1
      - name: Request Rejected
        description: |
          If Iconik answers 400, for example for a filter field or operator Iconik does not know. The message shows Iconik's reason unchanged
      - name: Authentication Failed
        description: |
          If the App ID or Auth Token is empty, or Iconik answers 401 or 403
      - name: Not Found
        description: |
          If Iconik answers 404, which it documents for a requested page that does not exist. The message names the page that failed, also during Fetch All
      - name: Rate Limited
        description: |
          If Iconik still answers 429 on the third attempt of a request. Between attempts the node waits as long as Iconik's Retry-After header says, at most 60 seconds, or 1 second and then 2 seconds when the header is missing
      - name: Connection Error
        description: |
          If the Iconik URL is not a valid http:// or https:// URL, Iconik cannot be reached, or Iconik does not answer within 30 seconds
      - name: Canceled
        description: |
          If the stream is canceled between two pages of Fetch All or while the node waits to retry a rate-limited request
      - name: API Error
        description: |
          If Iconik answers with any other non-2xx status
---
::
