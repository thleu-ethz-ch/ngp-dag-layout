module.exports = {
    /* node modules */
    lodash: require('lodash'),
    seedrandom: require('seedrandom'),
    Bench: require('./bench/bench').default,
    Loader: require('./parse/loader').default,
    Parser: require('./parse/parser').default,
    graph: {
        Graph: require('./graph/graph').default,
        Node: require('./graph/node').default,
        Edge: require('./graph/edge').default,
    },
    layoutGraph: {
        LayoutConnector: require('./layoutGraph/layoutConnector').default,
        LayoutEdge: require('./layoutGraph/layoutEdge').default,
        LayoutGraph: require('./layoutGraph/layoutGraph').default,
        LayoutNode: require('./layoutGraph/layoutNode').default,
    },
    levelGraph: {
        LevelGraph: require('./levelGraph/levelGraph').default,
        LevelNode: require('./levelGraph/levelNode').default,
    },
    rankGraph: {
        RankGraph: require('./rank/rankGraph').default,
        RankNode: require('./rank/rankNode').default,
    },
    layouter: {
        DagreLayouter: require('./layouter/dagreLayouter').default,
        MagneticSpringLayouter: require('./layouter/magneticSpringLayouter').default,
        SugiyamaLayouter: require('./layouter/sugiyamaLayouter').default,
    },
    util: {
        Download: require('./util/download').default,
        Serializer: require('./util/serializer').default,
        Timer: require('./util/timer').default,
        WorkerPool: require('./util/workerPool').default,
    },
};
