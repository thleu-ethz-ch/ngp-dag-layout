module.exports = {
    layouter: {
        DagreLayouter: require('./layouter/dagreLayouter').default,
        MagneticSpringLayouter: require('./layouter/magneticSpringLayouter').default,
        SugiyamaLayouter: require('./layouter/sugiyamaLayouter').default,
    },
    renderGraph: {
        RenderGraph: require('./renderGraph/renderGraph').default,
        GenericNode: require('./renderGraph/genericNode').default,
        GenericContainerNode: require('./renderGraph/genericContainerNode').default,
        GenericEdge: require('./renderGraph/genericEdge').default,
    },
    renderer: {
        PixiRenderer: require('./renderer/pixiRenderer').default,
        SvgRenderer: require('./renderer/svgRenderer').default,
    }
};
