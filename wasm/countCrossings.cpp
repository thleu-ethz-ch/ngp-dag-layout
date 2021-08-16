#include <stdio.h>
#include <cmath>
#include <algorithm>
#include <sys/time.h>
#if defined(WASM)
#include <emscripten.h>
#endif // WASM

extern "C" {
    typedef struct Edge {
        int north;
        int south;
        int weight;
    } Edge;

    typedef struct Neighbor {
        int end;
        int weight;
    } Neighbor;

    typedef struct Change {
        int begin;
        int end;
    } Change;

    typedef struct NodeMean {
        int n;
        float mean;
    } NodeMean;

    /**
     * Adapted from Barth, W., Jünger, M., & Mutzel, P. (2002, August). Simple and efficient bilayer cross counting.
     * In International Symposium on Graph Drawing (pp. 130-141). Springer, Berlin, Heidelberg.
     */
    int countCrossingsRank(int numNorth, int numSouth, int numEdges, int* countingTree, Edge* countingEdges) {
        // build the accumulator tree
        int firstIndex = 1;
        while (firstIndex < numSouth) {
            firstIndex *= 2; // number of tree nodes
        }
        int treeSize = 2 * firstIndex - 1;
        firstIndex -= 1; // index of leftmost leaf
        for (int i = 0; i < treeSize; ++i) {
            countingTree[i] = 0;
        }

        // compute the total weight of the crossings
        int crossWeight = 0;
        for (int i = 0; i < numEdges; ++i) {
            int index = countingEdges[i].south + firstIndex;
            countingTree[index] += countingEdges[i].weight;
            int weightSum = 0;
            while (index > 0) {
                if (index % 2) {
                    weightSum += countingTree[index + 1];
                }
                index = floor((index - 1) / 2);
                countingTree[index] += countingEdges[i].weight;
            }
            crossWeight += countingEdges[i].weight * weightSum;
        }
        return crossWeight;
    }

    int compareNorthSouth(const void* a, const void* b) {
        Edge* edgeA = (Edge*)a;
        Edge* edgeB = (Edge*)b;
        if (edgeA->north != edgeB->north) {
            return edgeA->north - edgeB->north;
        }
        return edgeA->south - edgeB->south;
    }

    int compareMeans(const void* a, const void* b) {
        NodeMean* meanA = (NodeMean*)a;
        NodeMean* meanB = (NodeMean*)b;
        return (meanA->mean < meanB->mean) ? -1 : (meanA->mean > meanB->mean);
    }

    int countCrossings(int r, int numNodes, int *testOrder, int* numNeighborsPerNode, Neighbor** neighborsPerNode, int numNodesNorth, int* positions, int* countingTree, Edge* countingEdges) {
        Edge* edgePointer = countingEdges;
        for (int southPos = 0; southPos < numNodes; ++southPos) {
            int southN = testOrder[southPos];
            for (int e = 0; e < numNeighborsPerNode[southN]; ++e) {
                Neighbor neighbor = neighborsPerNode[southN][e];
                int northPos = positions[neighbor.end];
                *edgePointer++ = {southPos, northPos, neighbor.weight};
            }
        }
        int numEdges = edgePointer - countingEdges;
        qsort(countingEdges, numEdges, sizeof(Edge), compareNorthSouth);
        return countCrossingsRank(numNodes, numNodesNorth, edgePointer - countingEdges, countingTree, countingEdges);
    }

    int totalCrossings(int numRanks, int* numNodesPerRank, int** orderPerRank, int* numUpEdgesPerNode, Neighbor** upEdgesPerNode, int* positions, int* crossings, int* countingTree, Edge* countingEdges) {
        int sum = 0;
        for (int r = 1; r < numRanks; ++r) {
            if (crossings[r] == 1000000000) {
                crossings[r] = countCrossings(r, numNodesPerRank[r], orderPerRank[r], numUpEdgesPerNode, upEdgesPerNode, numNodesPerRank[r - 1], positions, countingTree, countingEdges);
            }
            sum += crossings[r];
        }
        return sum;
    }

    int getChanges(int numNodes, int* newOrder, int* positions, Change* changes, int* permutation) {
        for (int pos = 0; pos < numNodes; ++pos) {
            permutation[pos] = positions[newOrder[pos]];
        }
        int seqStart = -1;
        int seqEnd = -1;
        Change* resultPointer = changes;
        for (int pos = 0; pos < numNodes; ++pos) {
            if (permutation[pos] > pos) {
                if (seqStart == -1) {
                    seqStart = pos;
                    seqEnd = permutation[pos];
                } else {
                    if (seqEnd < pos) {
                        *resultPointer++ = {seqStart, pos - 1};
                        seqStart = pos;
                        seqEnd = permutation[pos];
                    } else {
                        seqEnd = std::max(seqEnd, permutation[pos]);
                    }
                }
            }
            if (permutation[pos] == pos && seqStart != -1 && seqEnd < pos) {
                *resultPointer++ = {seqStart, pos - 1};
                seqStart = -1;
            }
        }
        if (seqStart != -1) {
            *resultPointer++ = {seqStart, numNodes - 1};
        }
        return resultPointer - changes;
    }

    int tryNewOrder(int* newOrder, int r, int* numNodesPerRank, int crossingOffsetNorth, int crossingOffsetSouth, int boolDirection, int signDirection, int lastRank, int* order, int* positions, int* crossings, int** numEdgesPerNodePerDir, Neighbor*** edgesPerNodePerDir, int* countingTree, Edge* countingEdges) {
        // count crossings with new orderOrder
        int numNodes = numNodesPerRank[r];
        int prevCrossingsNorth = crossings[r + crossingOffsetNorth];
        int newCrossingsNorth = countCrossings(r, numNodes, newOrder, numEdgesPerNodePerDir[!boolDirection], edgesPerNodePerDir[!boolDirection], numNodesPerRank[r - signDirection], positions, countingTree, countingEdges);

        int newCrossingsSouth = 0;
        int prevCrossingsSouth = 0;
        if (r != lastRank) {
            prevCrossingsSouth = crossings[r + crossingOffsetSouth];
            newCrossingsSouth = countCrossings(r, numNodes, newOrder, numEdgesPerNodePerDir[boolDirection], edgesPerNodePerDir[boolDirection], numNodesPerRank[r + signDirection], positions, countingTree, countingEdges);
        }
        bool fewerCrossingsNorth = newCrossingsNorth < prevCrossingsNorth;
        if (fewerCrossingsNorth) {
            crossings[r + crossingOffsetNorth] = newCrossingsNorth;
            if (r != lastRank) {
                crossings[r + crossingOffsetSouth] = newCrossingsSouth;
            }
            for (int n = 0; n < numNodes; ++n) {
                order[n] = newOrder[n];
            }
            for (int pos = 0; pos < numNodesPerRank[r]; ++pos) {
                positions[newOrder[pos]] = pos;
            }
            bool fewerCrossingsTotal = (newCrossingsNorth + newCrossingsSouth) < (prevCrossingsNorth + prevCrossingsSouth);
            return (1 + fewerCrossingsTotal);
        } else {
            return 0;
        }
    }

    void reorder(int numRanks, int numNodes, int maxId, int numEdges, int* inputArray) {
        int* inputStart = inputArray;
        char* nextFree = (char*)inputStart + (2 * numRanks - 1 + numNodes + 3 * numEdges) * sizeof(int);
        int* order = (int*)nextFree;
        nextFree += numNodes * sizeof(int);
        int* positions = (int*)nextFree;
        nextFree += (maxId + 1) * sizeof(int);
        int* numNodesPerRank = (int*)nextFree;
        nextFree += numRanks * sizeof(int);
        int** orderPerRank = (int**)nextFree;
        nextFree += numRanks * sizeof(int*);
        Neighbor* edges = (Neighbor*)nextFree;
        nextFree += 2 * numEdges * sizeof(Neighbor);
        Neighbor** edgesPerNode =  (Neighbor**)nextFree;
        nextFree += 2 * (maxId + 1) * sizeof(Neighbor*);
        Neighbor*** edgesPerNodePerDir = (Neighbor***)nextFree;
        nextFree += 2 * sizeof(Neighbor***);
        edgesPerNodePerDir[0] = edgesPerNode;
        edgesPerNodePerDir[1] = edgesPerNode + (maxId + 1);
        int* numEdgesPerNode = (int*)nextFree;
        nextFree += 2 * (maxId + 1) * sizeof(int);
        for (int i = 0; i < 2 * (maxId + 1); ++i) {
            numEdgesPerNode[i] = 0;
        }
        int** numEdgesPerNodePerDir = (int**)nextFree;
        nextFree += 2 * sizeof(int**);
        numEdgesPerNodePerDir[0] = numEdgesPerNode;
        numEdgesPerNodePerDir[1] = numEdgesPerNode + (maxId + 1);

        int maxNodesPerRank = 0;

        // read nodes
        int* numNodesPointer = numNodesPerRank;
        int* orderPointer = order;
        int** orderPerRankPointer = orderPerRank;
        for (int r = 0; r < numRanks; ++r) {
            int numNodes = *inputArray++;
            *numNodesPointer++ = numNodes;
            *orderPerRankPointer++ = orderPointer;
            for (int n = 0; n < numNodes; ++n) {
                *orderPointer++ = *inputArray++;
            }
            for (int pos = 0; pos < numNodes; ++pos) {
                positions[orderPerRank[r][pos]] = pos;
            }
            maxNodesPerRank = std::max(maxNodesPerRank, numNodes);
        }

        int maxEdgesPerRank = 0;
        // read edges
        int* edgesStart = inputArray;
        for (int r = 1; r < numRanks; ++r) {
            int numEdges = *inputArray++;
            for (int e = 0; e < numEdges; ++e) {
                int from = *inputArray++;
                int to = *inputArray++;
                inputArray++;
                numEdgesPerNodePerDir[0][to]++; // 0: up-neighbors
                numEdgesPerNodePerDir[1][from]++; // 1: down-neighbors 
            }
            maxEdgesPerRank = std::max(maxEdgesPerRank, numEdges);
        }
        
        Edge* countingEdges = (Edge*)nextFree;
        nextFree += maxEdgesPerRank * sizeof(Edge);

        Neighbor* edgesPointer = edges;
        Neighbor** edgesPerNodePointer = edgesPerNode;

        for (int dir = 0; dir < 2; ++dir) {
            for (int n = 0; n < maxId + 1; ++n) {
                *edgesPerNodePointer++ = edgesPointer;
                edgesPointer += numEdgesPerNodePerDir[dir][n];
            }
        }
        int maxWeight = 0;
        Neighbor** edgePointerPerNode = (Neighbor**)nextFree;
        nextFree += (maxId + 1) * sizeof(Neighbor*);
        for (int n = 0; n < maxId + 1; ++n) {
            edgePointerPerNode[n] = edgesPerNodePerDir[0][n];
        }
        inputArray = edgesStart;
        for (int r = 1; r < numRanks; ++r) {
            int numEdges = *inputArray++;
            for (int e = 0; e < numEdges; ++e) {
                int from = *inputArray++;
                int to = *inputArray++;
                int weight = *inputArray++;
                *(edgePointerPerNode[to])++ = {from, weight};
                maxWeight = std::max(maxWeight, weight);
            }
        }
        for (int n = 0; n < maxId + 1; ++n) {
            edgePointerPerNode[n] = edgesPerNodePerDir[1][n];
        }
        inputArray = edgesStart;
        for (int r = 1; r < numRanks; ++r) {
            int numEdges = *inputArray++;
            for (int e = 0; e < numEdges; ++e) {
                int from = *inputArray++;
                int to = *inputArray++;
                int weight = *inputArray++;
                *(edgePointerPerNode[from])++ = {to, weight};
            }
        }
        
        bool boolDirection = 1; // downward: 1; upward: 0
        int signDirection = 1; // downward: 1; upward: -1
        int crossingOffsetNorth = !boolDirection;
        int crossingOffsetSouth = boolDirection;

        // create local structures
        int* crossings = (int*)nextFree;
        nextFree += numRanks * sizeof(int);
        crossings[0] = 0;
        for (int r = 1; r < numRanks; ++r) {
            crossings[r] = 1000000000;
        }
        int treeSize = 1;
        while (treeSize < maxNodesPerRank) {
            treeSize *= 2;
        }
        treeSize *= 2;
        int* countingTree = (int*)nextFree;
        nextFree += treeSize * sizeof(int);
        Change* changes = (Change*)nextFree;
        nextFree += maxNodesPerRank * sizeof(Change);
        NodeMean* nodeMeans = (NodeMean*)nextFree;
        nextFree += maxNodesPerRank * sizeof(NodeMean);
        int* newNodeOrder = (int*)nextFree;
        nextFree += maxNodesPerRank * sizeof(int);
        int* tmpOrder = (int*)nextFree;
        nextFree += maxNodesPerRank * sizeof(int);
        int* permutation = (int*)nextFree;
        nextFree += maxNodesPerRank * sizeof(int);

        float multiplicator = (float)maxWeight * maxEdgesPerRank + 1;

        int minCrossings = __INT32_MAX__;
        int improveCounter = 2;
        while (improveCounter > 0) {
            improveCounter--;
            int firstRank = (boolDirection ? 1 : (numRanks - 2));
            int lastRank = (boolDirection ? (numRanks - 1) : 0);
            for (int r = firstRank; r - signDirection != lastRank; r += signDirection) {
                if (crossings[r + crossingOffsetNorth] == 0) {
                    continue;
                }
                bool hasChanged = true;
                while (hasChanged) {
                    hasChanged = false;
                    int numNodes = numNodesPerRank[r];
                    for (int pos = 0; pos < numNodes; ++pos) {
                        int n = orderPerRank[r][pos];
                        int sum = 0;
                        int num = 0;
                        for (int e = 0; e < numEdgesPerNodePerDir[!boolDirection][n]; ++e) {
                            Neighbor edge = edgesPerNodePerDir[!boolDirection][n][e];
                            int neighborPos = positions[edge.end];
                            sum += edge.weight * neighborPos;
                            num += edge.weight;
                        }
                        if (num > 0) {
                            nodeMeans[pos] = {n, multiplicator * sum / num + pos};
                        } else {
                            nodeMeans[pos] = {n, multiplicator * pos + pos};
                        }
                    }

                    // sort by the means
                    qsort(nodeMeans, numNodes, sizeof(NodeMean), compareMeans);
                    for (int pos = 0; pos < numNodes; ++pos) {
                        newNodeOrder[pos] = nodeMeans[pos].n;
                    }

                    int numChanges = getChanges(numNodes, newNodeOrder, positions, changes, permutation);
                    for (int c = 0; c < numChanges; ++c) {
                        Change change = changes[c];
                        for (int n = 0; n < numNodes; ++n) {
                            tmpOrder[n] = orderPerRank[r][n];
                        }
                        for (int i = change.begin; i <= change.end; ++i) {
                            tmpOrder[i] = newNodeOrder[i];
                        }
                        int result = tryNewOrder(tmpOrder, r, numNodesPerRank, crossingOffsetNorth, crossingOffsetSouth, boolDirection, signDirection, lastRank, orderPerRank[r], positions, crossings, numEdgesPerNodePerDir, edgesPerNodePerDir, countingTree, countingEdges);
                        if (result > 0) {
                            hasChanged = true;
                        }
                    }
                }
            }
            boolDirection = !boolDirection;
            signDirection *= -1;
            crossingOffsetNorth = !boolDirection;
            crossingOffsetSouth = boolDirection;
            int newCrossings = totalCrossings(numRanks, numNodesPerRank, orderPerRank, numEdgesPerNodePerDir[0], edgesPerNodePerDir[0], positions, crossings, countingTree, countingEdges);
            if (newCrossings < minCrossings) {
                minCrossings = newCrossings;
                improveCounter = 2;
            }
        }
        #if !defined(WASM)
        int numCrossings = 0;
        for (int r = 1; r < numRanks; ++r) {
            numCrossings += crossings[r];
        }
        //printf("crossings: %d\n", numCrossings);
        #endif // WASM
        
        // write back
        orderPointer = order;
        for (int i = 0; i < numNodes; ++i) {
            //printf("%d,", *orderPointer);
            *inputStart++ = *orderPointer++;
        }
    }

    int main() {
        FILE *input = fopen("test_bert.txt", "r");
        if (input == NULL) {
            fprintf(stderr, "Input file not found!\n");
            return 0;
        }
        int numRanks, numNodes, maxId, numEdges;
        if (fscanf(input, "%d,%d,%d,%d", &numRanks, &numNodes, &maxId, &numEdges) != 4) {
            fprintf(stderr, "Input file has wrong format!\n");
            return 0;
        }

        int* heap = (int*)calloc(1 << 28, sizeof(int));
        int* pointer = &heap[0];
        while (fscanf(input, ",%d", pointer++) > 0) {
            // just read
        }
        
        struct timeval start_t, end_t;
        gettimeofday(&start_t, NULL);
        reorder(numRanks, numNodes, maxId, numEdges, heap);
        gettimeofday(&end_t, NULL);
   
        double time = double(end_t.tv_sec - start_t.tv_sec) * 1000.0;
        time += double(end_t.tv_usec - start_t.tv_usec) / 1000.0;
        printf("%lf ms\n", time);
        free(heap);
        return 1;
    }
}
