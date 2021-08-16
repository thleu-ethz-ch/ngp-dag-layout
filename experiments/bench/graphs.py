POLY = ["npbench/polybench/adi", "npbench/polybench/atax", "npbench/polybench/bicg",
                    "npbench/polybench/cholesky", "npbench/polybench/correlation", "npbench/polybench/covariance",
                    "npbench/polybench/deriche", "npbench/polybench/doitgen", "npbench/polybench/durbin",
                    "npbench/polybench/fdtd_2d", "npbench/polybench/floyd_warshall", "npbench/polybench/gemm",
                    "npbench/polybench/gemver", "npbench/polybench/gesummv", "npbench/polybench/gramschmidt",
                    "npbench/polybench/heat_3d", "npbench/polybench/jacobi_1d", "npbench/polybench/jacobi_2d",
                    "npbench/polybench/k2mm", "npbench/polybench/k3mm", "npbench/polybench/lu",
                    "npbench/polybench/ludcmp", "npbench/polybench/mvt", "npbench/polybench/nussinov",
                    "npbench/polybench/seidel_2d", "npbench/polybench/symm", "npbench/polybench/syr2k",
                    "npbench/polybench/syrk", "npbench/polybench/trisolv", "npbench/polybench/trmm"]

POLY_DAGRE = ["npbench/polybench/atax", "npbench/polybench/bicg", "npbench/polybench/cholesky",
                          "npbench/polybench/correlation", "npbench/polybench/covariance", "npbench/polybench/deriche",
                          "npbench/polybench/doitgen", "npbench/polybench/fdtd_2d", "npbench/polybench/floyd_warshall",
                          "npbench/polybench/gemm", "npbench/polybench/gemver", "npbench/polybench/gesummv",
                          "npbench/polybench/gramschmidt", "npbench/polybench/heat_3d", "npbench/polybench/jacobi_1d",
                          "npbench/polybench/jacobi_2d", "npbench/polybench/k2mm", "npbench/polybench/k3mm",
                          "npbench/polybench/lu", "npbench/polybench/ludcmp", "npbench/polybench/mvt",
                          "npbench/polybench/nussinov", "npbench/polybench/seidel_2d", "npbench/polybench/symm",
                          "npbench/polybench/syrk", "npbench/polybench/trisolv", "npbench/polybench/trmm"]

TALL = ["bert2", "yolov4-fused"]

WIDE = ["bert", "eos", "linformer"]

PORT = ["deriche2", "lulesh", "va-gpu"]

DSW1 = ["d_sw1", "d_sw1-fused"]

ALL = POLY + WIDE + TALL + PORT + DSW1