import os

import polars as pl

##########################################
wfrc_root = os.path.join("00_WF", "2_WFRC", "FiscallyConstrained")
mag_root = os.path.join("00_WF", "3_MAG")
##########################################

wfrc_se_files = [
    os.path.join(wfrc_root, x) for x in os.listdir(wfrc_root) if x.endswith(".csv")
]
mag_se_files = [
    os.path.join(mag_root, x) for x in os.listdir(mag_root) if x.endswith(".csv")
]


def fix_se_file(se_file):
    fixed = (
        pl.read_csv(se_file).drop("", strict=False)
        # .rename({"": "Index", "CO_TAZID": ";CO_TAZID"}, strict=False)
        # .select(pl.col(";CO_TAZID"), pl.all().exclude(";CO_TAZID"))
    )
    return fixed


for se_file in wfrc_se_files:
    fixed = fix_se_file(se_file)
    fixed.write_csv(se_file)
for se_file in mag_se_files:
    fixed = fix_se_file(se_file)
    fixed.write_csv(se_file)
