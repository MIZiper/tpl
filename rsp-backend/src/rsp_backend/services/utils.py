def row_to_dict(row) -> dict:
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "hex"):
            d[k] = str(v)
    return d
