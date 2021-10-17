#!/bin/bash -e

set -o pipefail

# Generates a table with "MAP TYPE URL"
get_all_url() {
    local MAPS=( comarca municipi )
    local TYPES=( risc taxa_conf rt edat pcrpos taxapcr )

    for MAP in "${MAPS[@]}"
    do
	for TYPE in "${TYPES[@]}"
        do
            echo "${MAP} ${TYPE} https://dadescovid.cat/mapes?drop_dmapa=${TYPE}&drop_mapa=${MAP}&drop_es_residencia=0&id_html=sap_1_35&tipus=aga&codi=47"
        done
    done
}

transform_js_to_json() {
    local FILE="$1"
    local VARIABLE="$2"

    # Print collected data as JSON
    echo "console.log( JSON.stringify( ${VARIABLE} ) );" >> "${FILE}"

    # Output JSON data to be saved
    node "${FILE}"
}

# - Gets URL content
# - Extract relevant data
# - Output to JS file
# - Execute JS file (where extracted data is printed as plain JSON)
# - Save JSON data to file
parse_url() {
    local MAP="$1"
    local URL="$2"
    local DL_FILE="file.html"
    local DAYS_FILE="days.json"
    local TMP_FILE="file.js"

    # Download page and simplify id's to reduce space
    curl -s "${URL}" \
	| sed -e 's/'"${MAP}_"'/'"${MAP:0:1}"'_/g' \
	> "${DL_FILE}"

    # Check if we need to create the days array
    if [ ! -f "${DAYS_FILE}" ]
    then
        # Extract relevant data from JS code
        egrep '^\s*var (dies) =' "${DL_FILE}" \
            | sed -e 's/^\s*var /const /' \
            > "${TMP_FILE}"

	transform_js_to_json "${TMP_FILE}" "dies" > "${DAYS_FILE}"

        # Cleanup
        rm "${TMP_FILE}"
    fi

    # Check if we need to create the SVG for this map
    SVG_FILE="${MAP^}.svg"
    if [ ! -f "${SVG_FILE}" ]
    then
	sed -z 's#.*\(<svg.*</svg>\).*#\1#' "${DL_FILE}" > "${SVG_FILE}"
    fi

    # Extract relevant data from JS code
    egrep '^\s*var (titol|valor_label|valors) =' "${DL_FILE}" \
	| sed -e 's/^\s*var /const /' \
        > "${TMP_FILE}"

    # Unify collected data into a single object
    echo 'const data = {titol, valor_label, valors};' >> "${TMP_FILE}"

    transform_js_to_json "${TMP_FILE}" "data"

    # Cleanup
    rm "${DL_FILE}" "${TMP_FILE}"
}

get_all_url | while read MAP TYPE URL
do
    echo "- Generating map for ${MAP} / ${TYPE}..."
    parse_url "${MAP}" "${URL}" > "MapData-${MAP^}-${TYPE}.json"
done
