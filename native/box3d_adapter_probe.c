#include "box3d_adapter.h"

int main(void) {
    lag_world *test_world = lag_world_create(0.0, -9.81);
    if (test_world == NULL) {
        return 1;
    }

    if (lag_world_body_count(test_world) != 0) {
        lag_world_destroy(test_world);
        return 2;
    }

    lag_world_destroy(test_world);
    return 0;
}
