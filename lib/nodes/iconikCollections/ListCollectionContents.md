::wavedoc
---
title: List Collection Contents
description: |
  The List Collection Contents node lists what is directly inside one Iconik collection: assets, sub-collections or both, for example to process every asset of a delivery. It does not look inside sub-collections; to go deeper, run it again with a sub-collection's ID. By default it returns one page; with Fetch All enabled it pages through the whole collection, up to 10,000 objects, and sets a warning when there are more. The node changes nothing in Iconik. It ends on Success when Iconik answers, also for an empty collection; Total count is then 0 and Object IDs an empty list. Wire Object IDs into Get Asset, Get Metadata, Set Metadata or Delete Asset. The node authenticates with an Iconik App ID and Auth Token; wire both from Get Secret nodes. Iconik requires the can_read_collections role for this request. When Iconik rate-limits a request (429), the node tries it again, up to 3 attempts in total.
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
  - name: Collection ID
    description: |
      Enter the ID of the collection to list, for example the Collection ID output of Create Collection. It must be a UUID (36 characters with hyphens, upper or lower case); leading and trailing spaces are removed
    type: STRING
    mandatory: true
    example:
      - name: Collection ID
        value: "5c4b3a2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d"
  - name: Object Types
    description: |
      Choose what to list. Assets and Collections is the default
    type: STRING_SELECT
    mandatory: false
    options:
      - name: Assets
        description: |
          Lists assets only
      - name: Collections
        description: |
          Lists sub-collections only
      - name: Assets and Collections
        description: |
          Lists assets and sub-collections; each object's object_type says which it is
        default: true
    example:
      - name: Object Types
        value: "Assets and Collections"
  - name: Results per Page
    description: |
      Enter how many objects Iconik returns per page, a whole number from 1 to 500. Leave it empty to get 50, the default. With Fetch All enabled it sets the size of each page fetched
    type: NUMBER
    mandatory: false
    advanced: true
    example:
      - name: Results per Page
        value: 50
  - name: Page
    description: |
      Enter the number of the page to return, a whole number starting at 1. Leave it empty to get page 1, the default. Ignored when Fetch All is enabled
    type: NUMBER
    mandatory: false
    advanced: true
    example:
      - name: Page
        value: 1
  - name: Fetch All
    description: |
      Enable to fetch every page, starting at page 1, and return all objects together, up to 10,000; Page is then ignored. When the collection holds more, the first 10,000 are returned and Warning says so. Disabled by default
    type: BOOLEAN
    mandatory: false
    advanced: true
    example:
      - name: Fetch All
        value: false
  - name: Sort Order
    description: |
      Enter the sort order in Iconik's format: a field name and asc or desc, separated by a comma, with several fields separated by semicolons, e.g. title,asc;date_created,desc. It is sent to Iconik unchanged; leave it empty to use Iconik's default order
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Sort Order
        value: "date_created,desc"
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
  - name: Object IDs
    description: |
      Returns the IDs of the objects in Objects, in the order Iconik returned them. An empty list for an empty collection. Stays empty when the node fails
    type: STRING_LIST
    example:
      - name: Object IDs
        value: '["7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"]'
  - name: Total count
    description: |
      Returns how many objects of the chosen types the collection holds, as Iconik reports it. This can be larger than the number of Object IDs, which only covers the page or pages returned. Stays empty when the node fails
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
      Returns how many pages the listing has in Iconik at the current Results per Page. Stays empty when the node fails
    type: NUMBER
    example:
      - name: Pages
        value: 1
  - name: Warning
    description: |
      Returns a warning when Fetch All stopped at 10,000 objects while the collection holds more, with Iconik's total. Empty text otherwise. Stays empty when the node fails
    type: STRING
    example:
      - name: Warning
        value: "Fetch All stopped at 10000 objects; Iconik reports 12500 objects. Use Page to get the rest."
  - name: Objects
    description: |
      Returns the objects listed, unchanged, as a JSON list; with Fetch All enabled, the objects of all pages fetched. Each has fields such as id, title and object_type. Stays empty when the node fails
    type: JSON
    example:
      - name: Objects
        value: |
          [
            { "id": "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b", "title": "Summer_Campaign_Final.mov", "object_type": "assets" }
          ]
  - name: Contents result
    description: |
      Returns Iconik's response unchanged, with objects, page, pages, per_page and total; with Fetch All enabled, the response for the last page fetched only. Stays empty when the node fails
    type: JSON
    example:
      - name: Contents result
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
          curl -X GET \
            -H "App-ID: <your-app-id>" \
            -H "Auth-Token: <your-auth-token>" \
            -H "Content-Type: application/json" \
            -H "Accept: application/json" \
            -L --max-redirs 5 \
            "https://app.iconik.io/API/assets/v1/collections/5c4b3a2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d/contents/?object_types=assets%2Ccollections&page=1&per_page=50"
connectors:
  - name: Success
    description: |
      Triggered when Iconik answers every request with a 2xx status, including for an empty collection and when Fetch All stopped at 10,000 objects
  - name: Fail
    description: |
      Triggered when an input check fails or Iconik rejects a request. When an input check fails, nothing is sent to Iconik. With Fetch All enabled, a failure on any page fails the node and no objects are returned. Every error Iconik reports is shown as "Iconik returned <status>: <Iconik's error text>"
    causes:
      - name: Invalid Input
        description: |
          If Collection ID is not a UUID, Object Types is not one of its options, Results per Page is not a whole number from 1 to 500, or Page is not a whole number of at least 1
      - name: Request Rejected
        description: |
          If Iconik answers 400, for example for a Sort Order Iconik does not understand. The message shows Iconik's reason unchanged
      - name: Authentication Failed
        description: |
          If the App ID or Auth Token is empty, or Iconik answers 401 or 403
      - name: Not Found
        description: |
          If Iconik answers 404, which it documents for a collection that does not exist. The message names the Collection ID
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
