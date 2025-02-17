# ZotMoov Wildcard Formatting

ZotMoov keeps many of the same wildcards that Zotfile has, as well as the conditional and or wildcard operators

## Wildcards
- `%a` last name of the first author
- `%b` citation key
- `%I` author initials
- `%F` author's last name with first letter of first name (e.g. DoeJ)
- `%A` first letter of author
- `%d` last name of the first editor
- `%D` first letter of editor
- `%L` editor's last name with first letter of first name
- `%l` editor initials
- `%y` year
- `%m` month
- `%r` day (one <ins>r</ins>evolution around the sun)
- `%t` title
- `%T` item type (localized)
- `%j` name of the journal
- `%p` name of the publisher
- `%w` name of the journal or publisher (same as "%j|%p")
- `%s` journal abbreviation
- `%v` journal volume
- `%e` journal issue
- `%f` pages
- `%c` collection path. If your item was in collection Top > Bottom > Item, %c will be substituted to "Top/Bottom" 
    - **Note that if an item is in multiple collections, the collection that is opened in Zotero will be preferred**
- `%Y` year added to Zotero
- `%M` month added to Zotero
- `%R` day added to Zotero
- `%U` the string "undefined"

## Conditional

Only add the characters inside the curly brackets if ALL of the wildcards can be replaced. Otherwise, replace nothing.


- `{/%y}{/%j (%s)}{/%A}` - "/2002/American Journal of Sociology (AJS)/A" if BOTH %j AND %s can be replaced
    - otherwise "/2002/A"


## Or

Insert the first wildcard that can be replaced. Note that characters between the wildcard and the `|` will be removed.

- `{(%s | %j)}` - "(AJS)" if %s can be replaced
    - "(American Journal of Sociology)" if %s cannot be replaced and %j can be replaced
    - "" if neither can be replaced


## Multiple Slashes

Note that multiple slashes in a row are treated as one.

- So `/{%y}/{%j (%s)}/{%A}` is functionally the same as `{/%y}{/%j (%s)}{/%A}`

This is helpful in fallback scenarios.

- `/{%s}/{%y}{-%m}{-%r}/` can yield
    - "/AJS/2024-05-20/"
    - "/AJS/2024-05/"
    - "/AJS/2024/"
    - "/AJS//" which is effectively "/AJS/"
    - "///" which is effectively "/" the base ZotMoov directory

## Custom Wildcards

[Custom Wildcards](CUSTOM_WILDCARD_INFO.md)
