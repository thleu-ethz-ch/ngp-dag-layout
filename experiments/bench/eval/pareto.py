import numpy as np

'''
Helps calculate the pareto frontier.
'''


# adapted from Peter: https://stackoverflow.com/a/40239615
def _is_pareto_efficient(costs):
    is_efficient = np.ones(costs.shape[0], dtype=bool)
    for i, c in enumerate(costs):
        if is_efficient[i]:
            is_efficient[is_efficient] = np.any(costs[is_efficient] < c, axis=1)
            is_efficient[i] = True
    return is_efficient


def lines(cost_dict, time_dict):
    mask = _is_pareto_efficient(np.transpose(np.vstack((list(cost_dict.values()), list(time_dict.values())))))
    efficient_names = np.array(list(cost_dict.keys()))[mask]
    points = list(map(lambda name: (cost_dict[name], time_dict[name]), efficient_names))
    points.sort(key=(lambda point: point[0] / point[1]))
    lines = []
    for i in range(len(points) - 1):
        lines.append((points[i], points[i + 1]))
    return lines